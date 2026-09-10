import Link from 'next/link'
import { authedEmail } from '@/lib/news/auth'
import { ownerRollup } from '@/lib/pen/stats'

export const dynamic = 'force-dynamic'

// Owner-only. page_views already answers "did someone load the page"; this answers the only
// question that matters at two users — did they actually record anything, and did they return.
const OWNER = ['agustinvolantesilva@gmail.com', 'avolantesilva@gmail.com']

export default async function UsagePage() {
  const email = await authedEmail()
  if (!email || !OWNER.includes(email.toLowerCase())) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="pen-display text-[24px]">Not for you</h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--soft)' }}>
          This page is only visible to the account that runs Pen.
        </p>
        <Link href="/pen" className="pen-btn mt-6 inline-block">Back to Pen</Link>
      </main>
    )
  }

  let rows: Awaited<ReturnType<typeof ownerRollup>> = []
  let error: string | null = null
  try {
    rows = await ownerRollup()
  } catch (e) {
    error = (e as Error).message
  }

  const totals = rows.reduce(
    (a, r) => ({
      recordings: a.recordings + r.recordings,
      minutes: a.minutes + r.minutes,
      noted: a.noted + r.noted,
      briefings: a.briefings + r.briefingsSent,
      chat: a.chat + r.chatTurns,
    }),
    { recordings: 0, minutes: 0, noted: 0, briefings: 0, chat: 0 },
  )

  const now = Date.now()
  const days = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86_400_000)

  return (
    <main className="mx-auto max-w-[1000px] px-5 pb-24 pt-9 sm:px-8">
      <header className="flex items-end justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="pen-label">Owner only</div>
          <h1 className="pen-display mt-1.5 text-[28px] leading-none">Who is actually using Pen</h1>
        </div>
        <Link href="/pen" className="pen-btn">Back to Pen</Link>
      </header>

      {error && (
        <p className="mt-6 rounded-lg px-4 py-3 text-[13px]" style={{ background: 'var(--bad-wash)', color: 'var(--bad)', border: '1px solid #EFD6D2' }}>
          {error}
        </p>
      )}

      <div className="pen-ov-tiles">
        <div className="pen-ov-tile">
          <div className="pen-label">Accounts</div>
          <div className="pen-mono mt-2 text-[30px] leading-none">{rows.length}</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--dim)' }}>have recorded something</div>
        </div>
        <div className="pen-ov-tile">
          <div className="pen-label">Recordings</div>
          <div className="pen-mono mt-2 text-[30px] leading-none">{totals.recordings}</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--dim)' }}>{totals.minutes} minutes total</div>
        </div>
        <div className="pen-ov-tile">
          <div className="pen-label">Notes written</div>
          <div className="pen-mono mt-2 text-[30px] leading-none">{totals.noted}</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--dim)' }}>reached the note stage</div>
        </div>
        <div className="pen-ov-tile">
          <div className="pen-label">Engaged</div>
          <div className="pen-mono mt-2 text-[30px] leading-none">{totals.chat + totals.briefings}</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--dim)' }}>chat turns + briefings</div>
        </div>
      </div>

      <section className="pen-ov-sec">
        <div className="pen-label mb-3">Per account, most recently active first</div>
        {rows.length === 0 ? (
          <p className="text-[14px]" style={{ color: 'var(--dim)' }}>Nobody has recorded anything yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="pen-usage">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="n">Recs</th>
                  <th className="n">Mins</th>
                  <th className="n">Noted</th>
                  <th className="n">Chat</th>
                  <th className="n">Briefs</th>
                  <th className="n">Days used</th>
                  <th className="n">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ago = days(r.lastAt)
                  // One recording on one day is a trial, not usage. Say so rather than
                  // letting a row look like adoption.
                  const trial = r.daysActive <= 1
                  return (
                    <tr key={r.email}>
                      <td>
                        {r.email}
                        {trial && (
                          <span className="pen-mono ml-2 text-[9.5px]" style={{ color: 'var(--warn)' }}>
                            TRIED ONCE
                          </span>
                        )}
                      </td>
                      <td className="n">{r.recordings}</td>
                      <td className="n">{r.minutes}</td>
                      <td className="n">{r.noted}</td>
                      <td className="n">{r.chatTurns}</td>
                      <td className="n">{r.briefingsSent}</td>
                      <td className="n">{r.daysActive}</td>
                      <td className="n" style={{ color: ago > 7 ? 'var(--bad)' : 'var(--soft)' }}>
                        {ago === 0 ? 'today' : `${ago}d ago`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="pen-mono mt-4 text-[10px] leading-relaxed" style={{ color: 'var(--faint)' }}>
          Derived from pen_sessions, so it counts real work rather than page loads. &ldquo;Days
          used&rdquo; is distinct calendar days with at least one import — the number that
          separates someone who tried it from someone who uses it.
        </p>
      </section>
    </main>
  )
}
