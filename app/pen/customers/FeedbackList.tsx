import type { Feedback } from '@/lib/pen/feedback'

const LABEL = { very: 'Very disappointed', somewhat: 'Somewhat', not: 'Not disappointed' } as const

// Owners: every answer to the feedback pop-up. The headline is the share who'd be "very
// disappointed" without Juno; 40% or more is the usual sign the product has found its fit.
export default function FeedbackList({ rows, veryPct }: { rows: Feedback[]; veryPct: number | null }) {
  return (
    <section className="pen-ref">
      <div className="pen-ref-head">
        <h2 className="pen-display pen-ref-title">Feedback</h2>
        <p className="pen-cust-sub">
          {rows.length === 0
            ? 'No answers yet. The pop-up asks each customer once, after their 3rd finished recording.'
            : `${rows.length} answer${rows.length === 1 ? '' : 's'} · ${veryPct}% would be very disappointed without Juno (40% or more is the usual sign of fit).`}
        </p>
      </div>
      {rows.length > 0 && (
        <div className="pen-cust-wrap">
          <table className="pen-cust-table">
            <thead><tr><th>When</th><th>Who</th><th>If Juno went away</th><th>Fix or add</th><th>Who they’d tell, and why</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td>{r.email}</td>
                  <td><span className="pen-fb-pill" data-v={r.disappointed}>{LABEL[r.disappointed]}</span></td>
                  <td className="pen-fb-text">{r.fix ?? '—'}</td>
                  <td className="pen-fb-text">{r.tell ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
