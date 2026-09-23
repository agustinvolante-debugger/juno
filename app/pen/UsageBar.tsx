import Link from 'next/link'
import type { Allowance } from '@/lib/pen/allowance'
import { INCLUDED_HOURS, PLAN_TZ, fmtHours } from '@/lib/pen/plan'

/**
 * This month's recording against the twelve included hours, plus any bought ones.
 *
 * One component for the sidebar and the settings pages, so the two can never disagree. The
 * bar fills with the month's included hours only; bought hours are a separate line because
 * they do not reset, and folding them into the same bar would make the 1st look like a loss.
 */
export default function UsageBar({ allowance, showCta = true }: { allowance: Allowance | null; showCta?: boolean }) {
  if (!allowance) return null
  const a = allowance
  const usedIncluded = a.includedSec - a.includedLeftSec
  const pct = Math.min(100, (usedIncluded / a.includedSec) * 100)
  const out = !a.uncapped && a.remainingSec <= 0
  const close = !out && !a.uncapped && a.remainingSec <= 3600
  const tone = out ? 'over' : close ? 'close' : 'ok'
  const resets = new Date(a.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: PLAN_TZ })

  return (
    <div className="pen-meter" data-tone={tone}>
      <div className="pen-meter-head">
        <span className="pen-label">Recording this month</span>
      </div>
      <div className="pen-meter-n">
        {/* Uncapped accounts can pass twelve, so they see the real total rather than a full bar's worth. */}
        <strong>{fmtHours(a.uncapped ? a.usedThisMonthSec : usedIncluded)}</strong>
        <span className="pen-meter-un">{`of ${INCLUDED_HOURS}h used`}</span>
      </div>
      <div
        className="pen-meter-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={INCLUDED_HOURS * 60}
        aria-valuenow={Math.round(usedIncluded / 60)}
        aria-label="Included recording hours used this month"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="pen-meter-sub">
        {a.uncapped
          ? `No cap on this account. Resets ${resets}.`
          : out
            ? `Out of hours. New recordings are saved and wait until you add hours or ${resets}.`
            : `${fmtHours(a.includedLeftSec)} left this month. Resets ${resets}.`}
      </div>
      {a.boughtLeftSec > 0 && (
        <div className="pen-meter-sub">{`Plus ${fmtHours(a.boughtLeftSec)} of bought hours, which never expire.`}</div>
      )}
      {a.heldCount > 0 && (
        <div className="pen-meter-sub pen-meter-held">
          {`${a.heldCount} ${a.heldCount === 1 ? 'recording is' : 'recordings are'} waiting for hours.`}
        </div>
      )}
      {showCta && !a.uncapped && (
        <Link href="/pen/settings/hours" className="pen-meter-cta">Buy hours</Link>
      )}
    </div>
  )
}
