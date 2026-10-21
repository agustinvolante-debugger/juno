// Dev-only stand-in for the chat route (?chatmock=1, never in production): a fixed thread that
// shows every kind of part, and a fake event stream for new questions and button presses, so
// the chat can be reviewed and screenshotted without the server. Localhost signs in as the
// founder's real account, so the real route must never be hit from a screenshot run.

import type { AgentTurn, ChatReply, ChatTransport, StreamEvent } from './chat-stream'

export function chatMockOn(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('chatmock')
}

const T0 = Date.UTC(2026, 9, 21, 15, 0, 0)

const CITES = [
  { marker: 1, session_id: 'mock-board', title: 'Board meeting, 21 Oct', quote: 'I can have it Thursday, but not before.' },
  { marker: 2, session_id: 'mock-peter', title: 'Call with Peter Lang', quote: 'Legal has to sign off on the pricing page first.' },
]

export const MOCK_THREAD: AgentTurn[] = [
  { role: 'user', content: 'What did Peter say about the proposal deadline?', ts: T0 },
  {
    role: 'assistant',
    ts: T0 + 1,
    citations: CITES,
    content:
      'Peter committed to **Thursday**, and not earlier [1]. Two things hold it up:\n\n' +
      '- Legal still has to sign off on the *pricing page* [2]\n' +
      '- The chairs quote nobody asked for\n\n' +
      'What he asked of you:\n' +
      '1. Send the final numbers by Wednesday noon\n' +
      '2. Book the review with Sofía\n\n' +
      'His draft is at https://docs.example.com/proposal-v3 if you want to read ahead.',
  },
  { role: 'user', content: 'Put the review on my calendar Thursday at 10 and write up the plan', ts: T0 + 2 },
  {
    role: 'assistant',
    ts: T0 + 3,
    content: 'Done. *Proposal review* is on your calendar for Thursday 10:00–10:30, and the plan is written up in a Doc, with the numbers in a Sheet.',
    parts: {
      undoable: true,
      links: [
        { kind: 'event', title: 'Proposal review · Thu 10:00', url: 'https://calendar.google.com/calendar/event?eid=mock' },
        { kind: 'doc', title: 'Proposal plan', url: 'https://docs.google.com/document/d/mock' },
        { kind: 'sheet', title: 'Proposal numbers', url: 'https://docs.google.com/spreadsheets/d/mock' },
        { kind: 'notion', title: 'Q4 proposals', url: 'https://www.notion.so/mock' },
        { kind: 'recording', title: 'Board meeting, 21 Oct', url: '/pen?open=mock-board' },
      ],
    },
  },
  { role: 'user', content: 'Draft Peter a recap', ts: T0 + 4 },
  {
    role: 'assistant',
    ts: T0 + 5,
    content: 'Here’s a recap for Peter. Send it from your Gmail, or open it there to edit first.',
    parts: {
      draft: {
        from: 'agustin@tryjunoapp.com',
        to: ['peter.lang@northwind.co'],
        cc: ['sofia@northwind.co'],
        subject: 'Proposal: Thursday review and next steps',
        body:
          'Hi Peter,\n\nThanks for today. To recap:\n\n- You’ll send the final proposal Thursday.\n- Legal signs off on the pricing page first.\n- I’ll get you the final numbers by Wednesday noon.\n\nI’ve booked the review for Thursday at 10:00 with Sofía.\n\nBest,\nAgustin',
        composeUrl: 'https://mail.google.com/mail/?view=cm&fs=1&to=peter.lang%40northwind.co',
        mailtoUrl: 'mailto:peter.lang@northwind.co',
      },
    },
  },
  { role: 'user', content: 'Invite Sofía and Peter to the review', ts: T0 + 6 },
  {
    role: 'assistant',
    ts: T0 + 7,
    content: 'Ready to send the invite.',
    parts: { ask: { kind: 'invite', summary: 'Invite **Sofía** (sofia@northwind.co) and **Peter** (peter.lang@northwind.co) to *Proposal review*, Thursday 10:00?' } },
  },
]

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')) }, { once: true })
  })

let thread: AgentTurn[] = []

/** The fake route. Steps every ~1.4s so a screenshot can catch them mid-stream. */
export function mockTransport(seed: AgentTurn[]): ChatTransport {
  thread = seed.slice()
  return async function* (body, signal): AsyncGenerator<StreamEvent> {
    const now = Date.now()
    let steps: string[]
    let reply: AgentTurn
    const a = body.action
    if (a?.kind === 'confirm') {
      steps = a.yes ? ['Sending the invite…'] : []
      reply = { role: 'assistant', ts: now + 1, content: a.yes ? 'Sent. Sofía and Peter have the invite for Thursday 10:00.' : 'Okay, I didn’t send it.' }
    } else if (a?.kind === 'send_draft') {
      steps = ['Sending from your Gmail…']
      reply = { role: 'assistant', ts: now + 1, content: 'Sent to Peter, with Sofía in Cc.' }
    } else if (a?.kind === 'undo') {
      steps = ['Removing it from your calendar…']
      reply = { role: 'assistant', ts: now + 1, content: 'Undone: *Proposal review* is off your calendar.' }
    } else {
      const q = body.question ?? ''
      if (/fail|error/i.test(q)) {
        yield { event: 'progress', data: { label: 'Looking through your recordings…' } }
        await wait(1200, signal)
        yield { event: 'error', data: { error: 'The assistant hit an error answering that. Try again.' } }
        return
      }
      thread.push({ role: 'user', content: q, ts: now })
      steps = ['Looking through your recordings…', 'Checking your calendar…', 'Adding to your calendar…']
      reply = {
        role: 'assistant',
        ts: now + 1,
        content: 'I need your Google Calendar to book that. Connect it once and I’ll add **Friday’s follow-up** for you.',
        parts: { links: [{ kind: 'connect', title: 'Connect Google', url: '/pen/settings/connections#google' }] },
      }
    }
    for (const s of steps) {
      yield { event: 'progress', data: { label: s } }
      await wait(1400, signal)
    }
    thread.push(reply)
    const done: ChatReply = { chat: { id: 'mock-thread', messages: thread.slice() } }
    yield { event: 'done', data: done }
  }
}
