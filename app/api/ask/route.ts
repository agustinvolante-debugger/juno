/**
 * POST /api/ask — grounded, streaming answers over the retrieval index.
 *
 * Contract (newline-delimited JSON, one event per line):
 *   {"type":"sources","sources":[{n,label,href,...}]}   the chunks the answer may cite
 *   {"type":"text","text":"…"}                          answer deltas, in order
 *   {"type":"refusal","message":"…","closest":[…]}      nothing cleared the floor; no model call
 *   {"type":"error","message":"…"}                      operator-visible failure
 *   {"type":"done"}
 *
 * NDJSON rather than SSE because the client only needs ordered, typed events and
 * this keeps the reader in app/ask/page.tsx to a split on "\n".
 *
 * The Anthropic call is raw fetch, not @anthropic-ai/sdk: Gate 5 ships without
 * new npm dependencies. Shapes follow the current Messages API — streaming,
 * `model` from CONFIG.chatModel only (claude-sonnet-5, verified against the
 * current model list), no sampling parameters (rejected on this model), and
 * thinking explicitly disabled because an answer capped at CONFIG.maxAnswerTokens
 * must spend all of it on the answer (adaptive thinking is otherwise on by
 * default on this model).
 */
import { CONFIG } from "@/lib/ai-stack/config";
import { chunkHref, chunkLabel, nearestPages, retrieve } from "@/lib/ai-stack/retrieval";
import type { Hit } from "@/lib/ai-stack/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Guardrails. */
const MAX_QUESTION_CHARS = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 8;

/**
 * Per-IP sliding window, in memory. NOTE: this resets on every cold start and is
 * per-lambda-instance, so it throttles a single abusive client on a warm
 * instance and nothing more. If /ask ever matters enough to be worth attacking,
 * this needs shared state (Upstash/Redis or a Postgres counter) — it is
 * deliberately not a database dependency today (see research/adr-001-retrieval.md).
 */
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // crude bound; see note above
  return recent.length > RATE_MAX_REQUESTS;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const SYSTEM_PROMPT = `You are the research assistant for "The AI Stack", a citation-disciplined explainer of the AI value chain from primary energy to the enterprise dollar.

You answer ONLY from the numbered SOURCES supplied in the user message. They are excerpts from that site's own pages and from its sourced fact ledger.

Rules, in order of importance:
1. Never use your own knowledge of the AI industry. If a fact is not in the SOURCES, you do not know it — no matter how confident you feel. Your training data is not evidence here, and a plausible number that is not in the SOURCES is the single worst thing you can produce.
2. Every factual sentence ends with the reference of the source it came from, in square brackets: [2]. Combine when needed: [1][4]. A sentence with a number, a date, a company claim or a comparison in it must carry a reference.
3. If the SOURCES do not contain the answer, say so in the first sentence — plainly, e.g. "The corpus does not have that." Then say what the SOURCES do cover that is closest, with references. Never bridge a gap with an estimate, an average, or "roughly".
4. State uncertainty in the SOURCES' own terms: if a source is a forecast, an estimate or an opinion rather than a reported fact, say which. If sources disagree, say both and attribute them.
5. Do not answer questions about the future as if the corpus settled them. It records what has been disclosed and what named people have forecast, attributed — nothing more.
6. Be brief and specific: a few sentences, no preamble, no "great question", no bulleted restatement of the question. Prose, not headers. Use the numbers and the exact wording the SOURCES use.
7. Refuse to give investment advice. You may report what the SOURCES say and stop there.`;

function buildUserMessage(
  question: string,
  chunks: Hit[],
  currentPage: string | null,
): string {
  const sources = chunks
    .map((h, i) => {
      const c = h.chunk;
      const provenance =
        c.kind === "fact"
          ? `fact ledger entry ${c.factIds[0] ?? c.id}`
          : `${chunkLabel(c)} (${chunkHref(c)})`;
      return `[${i + 1}] ${provenance}\n${c.text}`;
    })
    .join("\n\n");
  const context = currentPage
    ? `\nThe reader is currently on ${currentPage}.\n`
    : "";
  return `SOURCES\n${sources}\n${context}\nQUESTION\n${question}`;
}

function line(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ type: "error", message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface AskBody {
  question?: unknown;
  page?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  // Fail loudly and specifically when the key is missing, rather than surfacing
  // a 401 from Anthropic as an opaque stream error.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError(
      "ANTHROPIC_API_KEY is not set on the server, so /ask cannot answer. Set it in the deployment environment (or .env.local for local development) and restart. Retrieval and the rest of the site are unaffected.",
      500,
    );
  }

  if (rateLimited(clientIp(req))) {
    return jsonError(
      `Too many questions from this address — the limit is ${RATE_MAX_REQUESTS} a minute. Try again shortly.`,
      429,
    );
  }

  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return jsonError(
      "Body must be JSON: { question: string, page?: string }.",
      400,
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const currentPage =
    typeof body.page === "string" && body.page.startsWith("/")
      ? body.page
      : null;

  if (question.length < 3)
    return jsonError("Ask a question of at least a few characters.", 400);
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(
      `Questions are capped at ${MAX_QUESTION_CHARS} characters; that one is ${question.length}.`,
      400,
    );
  }

  const chunks = retrieve(question, currentPage ? { currentPage } : {});

  // Below the relevance floor: refuse, name the closest pages, and do not call
  // the model at all.
  if (chunks.length === 0) {
    const closest = nearestPages(question, 3);
    const body = [
      JSON.stringify({
        type: "refusal",
        message:
          "Nothing in the corpus is close enough to that for me to answer it without guessing, so I won't. Every number on this site resolves to a sourced entry, and I would rather say I don't have it.",
        closest,
      }),
      JSON.stringify({ type: "done" }),
    ].join("\n");
    return new Response(`${body}\n`, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const sources = chunks.map((h, i) => ({
    n: i + 1,
    id: h.chunk.id,
    kind: h.chunk.kind,
    label: chunkLabel(h.chunk),
    href: chunkHref(h.chunk),
    layer: h.chunk.layer,
    factIds: h.chunk.factIds,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "sources", sources }));
      try {
        const upstream = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: CONFIG.chatModel,
            max_tokens: CONFIG.maxAnswerTokens,
            stream: true,
            thinking: { type: "disabled" },
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: buildUserMessage(question, chunks, currentPage),
              },
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          controller.enqueue(
            line({
              type: "error",
              message: `The model call failed (HTTP ${upstream.status}). ${detail.slice(0, 300)}`,
            }),
          );
          // Return only — `finally` below emits `done` and closes the stream.
          // Closing here as well throws "Controller is already closed" and Next
          // turns that into a dropped connection with no error visible to the
          // reader, which is how this was found.
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.startsWith("data:")) continue;
            const payload = part.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let event: unknown;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }
            const text = textDelta(event);
            if (text) controller.enqueue(line({ type: "text", text }));
            const apiError = errorMessage(event);
            if (apiError)
              controller.enqueue(line({ type: "error", message: apiError }));
          }
        }
      } catch (err) {
        controller.enqueue(
          line({
            type: "error",
            message: `The answer stream broke: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      } finally {
        controller.enqueue(line({ type: "done" }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/** Pull the text out of a `content_block_delta` event without trusting its shape. */
function textDelta(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; delta?: unknown };
  if (
    e.type !== "content_block_delta" ||
    typeof e.delta !== "object" ||
    e.delta === null
  ) {
    return null;
  }
  const delta = e.delta as { type?: unknown; text?: unknown };
  if (delta.type !== "text_delta" || typeof delta.text !== "string")
    return null;
  return delta.text;
}

function errorMessage(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; error?: unknown };
  if (e.type !== "error" || typeof e.error !== "object" || e.error === null)
    return null;
  const err = e.error as { message?: unknown };
  return typeof err.message === "string"
    ? err.message
    : "Unknown upstream error.";
}
