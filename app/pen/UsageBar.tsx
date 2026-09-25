import type { Allowance } from '@/lib/pen/allowance'
import { INCLUDED_HOURS, PLAN_TZ, fmtHours } from '@/lib/pen/plan'

/**
 * This month's recording. Every plan is unlimited with a fair-use ceiling (INCLUDED_HOURS), so
 * the meter reads as a total, and the ceiling only appears once someone is near it.
 *
 * One component for the sidebar and the settings pages, so the two can never disagree. The
 * bar fills with the month's included hours only; bought hours are a separate line because
 * they do not reset, and folding them into the same bar would make the 1st look like a loss.
 */
/** `showCta` is kept for callers; there is nothing to buy any more. */
export default function UsageBar({ allowance }: { allowance: Allowance | null; showCta?: boolean }) {
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
        <strong>{fmtHours(a.usedThisMonthSec)}</strong>
        <span className="pen-meter-un">recorded · unlimited</span>
      </div>
      {/* The bar only appears near the fair-use ceiling: under 80 hours it would be a sliver
          that makes "unlimited" look like a quota. */}
      {!a.uncapped && pct >= 80 && (
        <div
          className="pen-meter-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={INCLUDED_HOURS * 60}
          aria-valuenow={Math.round(usedIncluded / 60)}
          aria-label="Recording hours used against the fair-use limit"
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="pen-meter-sub">
        {out
          ? `You've passed the ${INCLUDED_HOURS}-hour fair-use limit. New recordings are saved and wait until ${resets}. Reply to any Juno Pen email if you need more.`
          : close || (!a.uncapped && pct >= 80)
            ? `Near the ${INCLUDED_HOURS}-hour fair-use limit: ${fmtHours(a.includedLeftSec)} left until ${resets}.`
            : `Counts from the 1st. Resets ${resets}.`}
      </div>
      {a.boughtLeftSec > 0 && (
        <div className="pen-meter-sub">{`Plus ${fmtHours(a.boughtLeftSec)} of bought hours, which never expire.`}</div>
      )}
      {a.heldCount > 0 && (
        <div className="pen-meter-sub pen-meter-held">
          {`${a.heldCount} ${a.heldCount === 1 ? 'recording is' : 'recordings are'} waiting for the month to reset.`}
        </div>
      )}
    </div>
  )
}
