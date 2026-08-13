/**
 * Hybrid retrieval for /ask — BM25 over the build-time index, plus exact
 * entity/fact-id matching, glossary query expansion, and a current-page boost.
 *
 * Per research/adr-001-retrieval.md the vector half of the spec's hybrid is
 * replaced by lexical retrieval over a committed index: this corpus is
 * entity-dense and terminologically consistent ("CoWoS", "slot reservation
 * agreement", "Ascend 910C"), which is where BM25 is strongest and embeddings
 * add least. The ADR's named mitigation for the one real weakness — paraphrase —
 * is glossary expansion, implemented in `expandQuery` below.
 *
 * Pure and synchronous: no I/O beyond the imported index, so scripts/eval-chatbot.mjs
 * can measure retrieval without an API key or a network.
 */
import { CONFIG } from "./config";
import { GLOSSARY } from "./glossary";
import { LAYERS } from "./layers";
import { SEARCH_INDEX } from "./search-index";
import type { Chunk, PageMeta } from "./search-index";

export type { Chunk, ChunkKind, PageMeta, SearchIndex } from "./search-index";

const IDX = SEARCH_INDEX;

/* ─────────────────────────── tokenizer ───────────────────────────
 * MIRRORED FROM scripts/build-index.mjs. If the two ever diverge, query terms
 * silently stop matching posting lists — so the index ships a probe string and
 * its expected tokenization, and we verify it at module load (below). */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "which",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /[a-z0-9]+(?:[.'\-+][a-z0-9]+)*/g;
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const tok = m[0];
    if (tok.length < 2 && !/[0-9]/.test(tok)) continue;
    if (!STOPWORDS.has(tok)) out.push(tok);
    if (/[.'\-+]/.test(tok)) {
      for (const part of tok.split(/[.'\-+]/)) {
        if (part.length < 3) continue;
        if (STOPWORDS.has(part)) continue;
        out.push(part);
      }
    }
  }
  return out;
}

{
  const got = tokenize(IDX.tokenizer.probe).join("|");
  const want = IDX.tokenizer.probeTokens.join("|");
  if (got !== want) {
    throw new Error(
      "Tokenizer drift: lib/retrieval.ts and scripts/build-index.mjs disagree. " +
        `Probe expected [${want}] but produced [${got}]. Re-run \`npm run build:index\`, ` +
        "or bring the two tokenizers back into agreement.",
    );
  }
}

/* ─────────────────────────── tuning constants ─────────────────────────── */

/** Expanded (glossary-derived) terms count for less than the reader's own words. */
const EXPANSION_WEIGHT = 0.55;
/** A fact id typed verbatim is an unambiguous request for that fact. */
const FACT_ID_BONUS = 1.0;
/** A named company or scenario. */
const ENTITY_BONUS = 0.4;
/** A named layer — weaker, because layer words ("cloud", "grid") are everywhere. */
const LAYER_BONUS = 0.22;
/** Per-additional-chunk decay from the same page during the final rerank. */
const DIVERSITY_DECAY = 0.82;

/**
 * THE RELEVANCE FLOOR — in BM25 evidence units: the raw BM25 score of the best
 * chunk, i.e. how much idf-weighted query vocabulary one chunk actually matched.
 * Below it, `retrieve` returns [] and the caller must refuse without a model call.
 *
 * Chosen empirically from scripts/eval-chatbot.mjs, which prints `evidence` and
 * `coverage` for every case. Measured on this corpus: the 45 in-corpus questions
 * run 8.5–35.7, median ≈ 18.5; questions the corpus is not about run lower
 * ("what is the capital of France" 3.5, "will there be a recession in 2027" 5.5,
 * "how do I train a puppy" 7.1, "who will win the AI race" 7.7). **8.0** clears
 * every in-corpus question and rejects those.
 *
 * Why raw rather than a share-of-query-matched ratio: a ratio scores nonsense
 * queries *highly* (a two-word off-topic question that matches one word matches
 * a large share of itself). Raw evidence asks the question that matters — did
 * any single chunk supply enough sourced vocabulary to ground an answer.
 *
 * The band 7.7–8.5 is genuinely tight, which is why COVERAGE_FLOOR below is the
 * second condition rather than a nicety: a terse in-corpus question ("how fast
 * is Mercor growing", evidence 8.5) covers most of its own vocabulary, while an
 * off-corpus question that scrapes past on a stray rare word ("median tenure of
 * a data centre technician in Ohio", evidence 8.6) does not — its subject nouns
 * appear nowhere in the corpus.
 *
 * What this floor deliberately does NOT do: it cannot separate "the corpus is
 * not about this" from "the corpus is about this but does not contain the number
 * you asked for". "What will NVIDIA's Q4 revenue be?" is lexically identical to
 * a question about NVIDIA's reported quarters, and it *should* retrieve them —
 * the refusal there belongs to the grounded answer step, which is instructed to
 * say plainly when the supplied chunks do not contain the answer. The floor
 * handles off-corpus; the system prompt handles adjacent-but-unsupported. The
 * eval labels each refusal case with the layer expected to catch it.
 *
 * Set nearer the refusal side on purpose: on a site whose whole claim is
 * citation discipline, a confident wrong answer costs more than "I don't have
 * that" (ADR-001) — and refusal still names the three closest pages, so a miss
 * degrades to a pointer rather than to nothing.
 */
export const RELEVANCE_FLOOR = 8.0;

/**
 * The floor's second condition: the best chunk must also cover at least 30% of
 * the question's idf mass, where words absent from the corpus are charged at the
 * idf of a once-seen term. That charge is the point — a question whose subject
 * nouns ("tenure", "technician", "glassdoor", "patents") appear nowhere in 187k
 * tokens of corpus cannot be answered from it, however well its remaining words
 * match. In-corpus questions measure 0.43–1.00 here; the off-corpus questions
 * this catches measure 0.22–0.27.
 */
export const COVERAGE_FLOOR = 0.3;

/* ─────────────────────────── query expansion ─────────────────────────── */

export interface ExpandedQuery {
  /** term → weight */
  terms: Map<string, number>;
  original: string[];
  /** Glossary terms whose vocabulary was folded in, for explainability. */
  expandedFrom: string[];
}

/** Normalise to space-delimited words so phrase tests are word-boundary safe. */
function normalizePhrase(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

function containsPhrase(haystackNorm: string, needle: string): boolean {
  const n = normalizePhrase(needle);
  return n.trim().length >= 3 && haystackNorm.includes(n);
}

/**
 * Fold in glossary vocabulary. The glossary already carries `aka` for every term
 * because readers arrive with different words, which makes it a synonym
 * dictionary at no extra cost: "backlog" reaches "remaining performance
 * obligation", "capex" reaches "capital expenditure".
 */
export function expandQuery(query: string): ExpandedQuery {
  const terms = new Map<string, number>();
  const original = tokenize(query);
  for (const t of original) terms.set(t, Math.max(terms.get(t) ?? 0, 1));

  const norm = normalizePhrase(query);
  const expandedFrom: string[] = [];
  for (const entry of GLOSSARY) {
    const surfaces = [
      entry.term,
      ...(entry.aka ?? []),
      ...(entry.searchAliases ?? []),
      entry.id,
    ];
    if (!surfaces.some((s) => containsPhrase(norm, s))) continue;
    expandedFrom.push(entry.term);
    for (const s of surfaces) {
      for (const t of tokenize(s)) {
        if (terms.has(t)) continue; // never dilute a term the reader typed
        terms.set(t, EXPANSION_WEIGHT);
      }
    }
  }
  return { terms, original, expandedFrom };
}

/* ─────────────────────────── BM25 ─────────────────────────── */

/** idf a term absent from the corpus would carry (df = 1) — used to keep an
 *  unmatched, corpus-absent word in the denominator of `coverage`. */
const IDF_UNSEEN = Math.log(1 + (IDX.bm25.N - 1 + 0.5) / 1.5);

interface Bm25Result {
  /** chunk index → raw BM25 score (the "evidence" the floor is applied to). */
  raw: Map<number, number>;
  /** chunk index → idf mass of the query terms this chunk actually contains. */
  matchedMass: Map<number, number>;
  /** idf mass of query terms that exist in the corpus at all. */
  knownMass: number;
  /** idf mass of the whole query, absent terms charged at IDF_UNSEEN. */
  totalMass: number;
}

function bm25(terms: Map<string, number>): Bm25Result {
  const { k1, b, avgdl, docLens, idf, postings } = IDX.bm25;
  const raw = new Map<number, number>();
  const matchedMass = new Map<number, number>();
  let knownMass = 0;
  let totalMass = 0;
  for (const [term, weight] of terms) {
    const posting = postings[term];
    const termIdf = idf[term];
    if (posting === undefined || termIdf === undefined) {
      totalMass += weight * IDF_UNSEEN;
      continue;
    }
    knownMass += weight * termIdf;
    totalMass += weight * termIdf;
    for (const [doc, tf] of posting) {
      const dl = docLens[doc] ?? avgdl;
      const denom = tf + k1 * (1 - b + (b * dl) / avgdl);
      raw.set(
        doc,
        (raw.get(doc) ?? 0) + (weight * termIdf * (tf * (k1 + 1))) / denom,
      );
      matchedMass.set(doc, (matchedMass.get(doc) ?? 0) + weight * termIdf);
    }
  }
  return { raw, matchedMass, knownMass, totalMass };
}

/* ─────────────────────────── exact / entity matching ─────────────────────────── */

const FACT_IDS = new Set(IDX.factIds);

/** Names readers use that are not the page title. Kept small and explicit. */
const PAGE_ALIASES: Record<string, string[]> = {
  "/companies/alphabet": ["google", "google cloud", "gcp", "deepmind"],
  "/companies/amazon": ["aws", "amazon web services", "trainium"],
  "/companies/microsoft": ["azure", "msft"],
  "/companies/hon-hai": ["foxconn"],
  "/companies/meta": ["facebook"],
  "/companies/tsmc": ["taiwan semiconductor"],
  "/companies/sk-hynix": ["hynix"],
  "/companies/scale-ai": ["scale"],
  "/companies/ge-vernova": ["ge"],
};

interface EntityRule {
  surfaces: string[];
  bonus: number;
  /** Boost chunks on this exact page. */
  page?: string;
  /** Boost chunks belonging to this layer, wherever they live. */
  layer?: string;
}

const ENTITY_RULES: EntityRule[] = (() => {
  const rules: EntityRule[] = [];
  for (const layer of LAYERS) {
    rules.push({
      surfaces: [layer.slug, layer.slug.replace(/-/g, " "), layer.name],
      bonus: LAYER_BONUS,
      layer: layer.slug,
      page: `/stack/${layer.slug}`,
    });
  }
  for (const [path, meta] of Object.entries(IDX.pages)) {
    if (meta.kind !== "company" && meta.kind !== "scenario") continue;
    const slug = path.slice(path.lastIndexOf("/") + 1);
    rules.push({
      surfaces: [
        meta.title,
        slug,
        slug.replace(/-/g, " "),
        ...(PAGE_ALIASES[path] ?? []),
      ],
      bonus: ENTITY_BONUS,
      page: path,
    });
  }
  return rules;
})();

/** chunk index lookup by page / layer, built once. */
const BY_PAGE = new Map<string, number[]>();
const BY_LAYER = new Map<string, number[]>();
const BY_FACT_ID = new Map<string, number[]>();
IDX.chunks.forEach((c, i) => {
  const p = BY_PAGE.get(c.page);
  if (p) p.push(i);
  else BY_PAGE.set(c.page, [i]);
  const l = BY_LAYER.get(c.layer);
  if (l) l.push(i);
  else BY_LAYER.set(c.layer, [i]);
  for (const id of c.factIds) {
    const f = BY_FACT_ID.get(id);
    if (f) f.push(i);
    else BY_FACT_ID.set(id, [i]);
  }
});

function exactBonuses(query: string): Map<number, number> {
  const bonuses = new Map<number, number>();
  const add = (doc: number, amount: number) => {
    bonuses.set(doc, Math.max(bonuses.get(doc) ?? 0, amount));
  };

  // 1. Fact ids typed verbatim ("cloud-big4-capex-2025-actual").
  for (const m of query
    .toLowerCase()
    .matchAll(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g)) {
    if (!FACT_IDS.has(m[0])) continue;
    for (const doc of BY_FACT_ID.get(m[0]) ?? []) add(doc, FACT_ID_BONUS);
  }

  // 2. Company / scenario / layer names.
  const norm = normalizePhrase(query);
  for (const rule of ENTITY_RULES) {
    if (!rule.surfaces.some((s) => containsPhrase(norm, s))) continue;
    if (rule.page)
      for (const doc of BY_PAGE.get(rule.page) ?? []) add(doc, rule.bonus);
    if (rule.layer)
      for (const doc of BY_LAYER.get(rule.layer) ?? [])
        add(doc, rule.bonus * 0.6);
  }
  return bonuses;
}

/* ─────────────────────────── retrieve ─────────────────────────── */

export interface RetrieveOptions {
  /** The page the reader is on, e.g. "/stack/cloud". Boosted by CONFIG. */
  currentPage?: string;
  /** Defaults to CONFIG.retrieval.rerankTo. */
  limit?: number;
}

export interface Hit {
  chunk: Chunk;
  /** Ranking score: idf-normalised BM25 + exact bonuses, current-page boost applied. */
  score: number;
  /** Raw BM25 — the quantity RELEVANCE_FLOOR is compared against. */
  evidence: number;
  bonus: number;
  matched: "lexical" | "exact" | "both";
}

interface DocScore {
  raw: number;
  normalized: number;
  bonus: number;
  score: number;
}

interface ScoredDocs {
  merged: Map<number, DocScore>;
  /** Best raw BM25 across candidates — compared against RELEVANCE_FLOOR. */
  evidence: number;
  /** Best share of the query's idf mass any one chunk covered (0–1). */
  coverage: number;
  expanded: ExpandedQuery;
}

function scoreAll(query: string, currentPage?: string): ScoredDocs {
  const expanded = expandQuery(query);
  const { raw, matchedMass, knownMass, totalMass } = bm25(expanded.terms);
  const divisor = knownMass > 0 ? knownMass : 1;
  const bonuses = exactBonuses(query);

  // Two candidate pools, then merge → dedupe by chunk id → rerank (the shape the
  // spec asks for; ADR-001 makes the first pool lexical instead of vector).
  const lexicalPool = [...raw.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONFIG.retrieval.textTopK);
  const exactPool = [...bonuses.entries()]
    .sort((a, b) => b[1] - a[1] || (raw.get(b[0]) ?? 0) - (raw.get(a[0]) ?? 0))
    .slice(0, CONFIG.retrieval.vectorTopK);

  const merged = new Map<number, DocScore>();
  for (const [doc] of [...lexicalPool, ...exactPool]) {
    if (merged.has(doc)) continue;
    const rawScore = raw.get(doc) ?? 0;
    const normalized = rawScore / divisor;
    const bonus = bonuses.get(doc) ?? 0;
    const onPage =
      currentPage !== undefined && IDX.chunks[doc]?.page === currentPage;
    const boost = onPage ? CONFIG.retrieval.currentPageBoost : 1;
    merged.set(doc, {
      raw: rawScore,
      normalized,
      bonus,
      score: (normalized + bonus) * boost,
    });
  }

  let evidence = 0;
  let coverage = 0;
  for (const [doc, v] of merged) {
    evidence = Math.max(evidence, v.raw);
    coverage = Math.max(
      coverage,
      (matchedMass.get(doc) ?? 0) / Math.max(totalMass, 1e-9),
    );
  }
  return { merged, evidence, coverage, expanded };
}

/**
 * Retrieve the chunks that may be cited when answering `query`.
 * Returns `[]` when nothing clears RELEVANCE_FLOOR — the caller must then refuse
 * rather than answer, and must not call the model at all.
 */
export function retrieve(query: string, options: RetrieveOptions = {}): Hit[] {
  if (query.trim().length === 0) return [];
  const { merged, evidence, coverage } = scoreAll(query, options.currentPage);
  if (evidence < RELEVANCE_FLOOR || coverage < COVERAGE_FLOOR) return [];

  const ranked = [...merged.entries()]
    .map(([doc, v]) => {
      const chunk = IDX.chunks[doc];
      const matched: Hit["matched"] =
        v.bonus > 0 && v.raw > 0 ? "both" : v.bonus > 0 ? "exact" : "lexical";
      return {
        chunk,
        score: v.score,
        evidence: v.raw,
        bonus: v.bonus,
        matched,
      };
    })
    .filter((h) => h.chunk !== undefined && h.score > 0)
    .sort((a, b) => b.score - a.score || (a.chunk.id < b.chunk.id ? -1 : 1));

  // Final rerank with a page-diversity decay. Naming a company boosts every
  // chunk on its page at once, which otherwise fills all six slots with adjacent
  // sections of one page and starves the answer of the ledger entry that carries
  // the actual figure. Ledger chunks do not decay against each other — each is an
  // independent sourced claim, not another slice of the same prose.
  const limit = options.limit ?? CONFIG.retrieval.rerankTo;
  const picked: Hit[] = [];
  const taken = new Set<string>();
  const perPage = new Map<string, number>();
  while (picked.length < limit) {
    let best: Hit | null = null;
    let bestValue = -Infinity;
    for (const hit of ranked) {
      if (taken.has(hit.chunk.id)) continue;
      const seen =
        hit.chunk.kind === "page" ? (perPage.get(hit.chunk.page) ?? 0) : 0;
      const value = hit.score * DIVERSITY_DECAY ** seen;
      if (value > bestValue) {
        bestValue = value;
        best = hit;
      }
    }
    if (!best) break;
    taken.add(best.chunk.id);
    if (best.chunk.kind === "page") {
      perPage.set(best.chunk.page, (perPage.get(best.chunk.page) ?? 0) + 1);
    }
    picked.push(best);
  }
  return picked;
}

export interface Explanation {
  /** Best raw BM25 — compared against RELEVANCE_FLOOR. */
  evidence: number;
  /** Best share of the query's idf mass covered by one chunk (0–1). */
  coverage: number;
  /** Glossary terms whose vocabulary was folded into the query. */
  expandedFrom: string[];
  passesFloor: boolean;
}

/** Why a query did or did not clear the floor — used by the eval report. */
export function explain(
  query: string,
  options: RetrieveOptions = {},
): Explanation {
  if (query.trim().length === 0)
    return { evidence: 0, coverage: 0, expandedFrom: [], passesFloor: false };
  const { evidence, coverage, expanded } = scoreAll(query, options.currentPage);
  return {
    evidence,
    coverage,
    expandedFrom: expanded.expandedFrom,
    passesFloor: evidence >= RELEVANCE_FLOOR && coverage >= COVERAGE_FLOOR,
  };
}

export interface NearPage {
  page: string;
  title: string;
  score: number;
}

/**
 * The closest pages regardless of the floor — what the refusal path offers
 * instead of a guess.
 */
export function nearestPages(query: string, n = 3): NearPage[] {
  if (query.trim().length === 0) return [];
  const { merged } = scoreAll(query);
  const best = new Map<string, number>();
  for (const [doc, v] of merged) {
    const chunk = IDX.chunks[doc];
    if (!chunk) continue;
    // /sources is the bibliography, not an explainer — never offered as a "read this".
    const page = chunk.kind === "fact" ? pageForLayer(chunk.layer) : chunk.page;
    if (!page) continue;
    best.set(page, Math.max(best.get(page) ?? 0, v.score));
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([page, score]) => ({ page, title: pageTitle(page), score }));
}

function pageForLayer(layer: string): string | null {
  return LAYERS.some((l) => l.slug === layer) ? `/stack/${layer}` : null;
}

/** Layer pages are titled from lib/layers.ts (the index only knows the slug). */
export function pageTitle(path: string): string {
  const layer = LAYERS.find((l) => `/stack/${l.slug}` === path);
  if (layer) return layer.name;
  const meta: PageMeta | undefined = IDX.pages[path];
  return meta?.title ?? path;
}

/** Deep link for a citation: the section the claim is actually printed in. */
export function chunkHref(chunk: Chunk): string {
  return chunk.anchor ? `${chunk.page}#${chunk.anchor}` : chunk.page;
}

export function chunkLabel(chunk: Chunk): string {
  if (chunk.kind === "fact")
    return `Source · ${chunk.factIds[0] ?? chunk.heading}`;
  const title = pageTitle(chunk.page);
  return chunk.heading && chunk.heading !== "Introduction"
    ? `${title} · ${chunk.heading}`
    : title;
}

/** Guard used by the eval and by anything tempted to cite an id from prose. */
export function isCitableFactId(id: string): boolean {
  return FACT_IDS.has(id);
}

export function indexStats(): {
  chunks: number;
  pages: number;
  terms: number;
  facts: number;
} {
  return {
    chunks: IDX.chunks.length,
    pages: Object.keys(IDX.pages).length,
    terms: Object.keys(IDX.bm25.postings).length,
    facts: IDX.factIds.length,
  };
}
