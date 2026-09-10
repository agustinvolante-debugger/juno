'use client'

import { motion } from 'motion/react'
import type { ArchiveStats } from '@/lib/pen/stats'

// What you see when no recording is selected. That space used to say "Choose a recording",
// which is a wasted screen — this is the reason to come back on a Monday.
//
// Deliberately NOT charty. The data's job here is magnitude and a to-do list, so the form is
// stat tiles plus one single-hue meter. A meeting-type breakdown would need a categorical
// palette, and the validator confirms this system's accent + status colours fail as one
// (chroma floor, CVD separation) — they are one accent and three reserved status colours, not
// a series. Figures use the mono, not the display serif: a serif number reads as decoration
// rather than data.

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 }

export default function Overview({
  stats,
  onOpen,
}: {
  stats: ArchiveStats
  onOpen: (sessionId: string) => void
}) {
  if (!stats.recordings) return <EmptyArchive />

  const hours = stats.minutes / 60
  const doneCount = stats.actionsTotal - stats.actionsOpen
  const donePct = stats.actionsTotal ? (doneCount / stats.actionsTotal) * 100 : 0

  return (
    <div className="pen-ov">
      <div className="pen-ov-head">
        <div>
          <div className="pen-label">Your archive</div>
          <h2 className="pen-display mt-1.5 text-[26px] leading-tight">
            {stats.recordings} recording{stats.recordings === 1 ? '' : 's'}, and what came out of them
          </h2>
        </div>
        {stats.lastAt && (
          <span className="pen-mono text-[10.5px]" style={{ color: 'var(--faint)' }}>
            latest {new Date(stats.lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* KPI row — magnitude, so tiles rather than a plot */}
      <div className="pen-ov-tiles">
        <Tile label="Recorded" value={hours >= 1 ? `${hours.toFixed(1)}h` : `${stats.minutes}m`} sub={`${stats.recordings} recordings`} />
        <Tile label="Still to do" value={String(stats.actionsOpen)} sub={`of ${stats.actionsTotal} actions`} tone={stats.actionsOpen > 0 ? 'warn' : 'good'} />
        <Tile label="Nearly missed" value={String(stats.missedSurfaced)} sub="things surfaced" />
        <Tile label="People" value={String(stats.peopleMet)} sub="named across meetings" />
      </div>

      {/* One meter. Single hue, lighter step of the same ramp as the track. */}
      {stats.actionsTotal > 0 && (
        <div className="pen-ov-meter-wrap">
          <div className="flex items-baseline justify-between">
            <span className="pen-label">Follow-through</span>
            <span className="pen-mono text-[11px] tabular-nums" style={{ color: 'var(--soft)' }}>
              {doneCount}/{stats.actionsTotal} done
            </span>
          </div>
          <div className="pen-ov-meter" role="img" aria-label={`${doneCount} of ${stats.actionsTotal} actions done`}>
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${donePct}%` }}
              transition={{ ...SPRING, delay: 0.1 }}
            />
          </div>
        </div>
      )}

      {/* The actionable core */}
      {stats.openActions.length > 0 && (
        <section className="pen-ov-sec">
          <div className="pen-label mb-3">Outstanding, oldest and most urgent first</div>
          <ul className="pen-ov-list">
            {stats.openActions.slice(0, 12).map((a, i) => (
              <motion.li
                key={`${a.sessionId}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: Math.min(i * 0.03, 0.3) }}
              >
                <button className="pen-ov-act" onClick={() => onOpen(a.sessionId)}>
                  <span className="pen-ov-act-main">
                    <span className="text-[15px] leading-snug">{a.action}</span>
                    <span className="pen-mono mt-1 flex flex-wrap items-center gap-x-2 text-[10px]" style={{ color: 'var(--faint)' }}>
                      {/* Status carries a word, never colour alone. */}
                      {a.priority === 'high' && <span style={{ color: 'var(--bad)' }}>PRIORITY</span>}
                      {a.owner && <span>{a.owner}</span>}
                      {a.due && <span style={{ color: 'var(--accent-ink)' }}>{a.due}</span>}
                      <span>{a.sessionTitle.length > 46 ? `${a.sessionTitle.slice(0, 46).trimEnd()}\u2026` : a.sessionTitle}</span>
                    </span>
                  </span>
                  <span className="pen-ov-act-go" aria-hidden>&rarr;</span>
                </button>
              </motion.li>
            ))}
          </ul>
          {stats.openActions.length > 12 && (
            <p className="pen-mono mt-3 text-[10.5px]" style={{ color: 'var(--faint)' }}>
              and {stats.openActions.length - 12} more
            </p>
          )}
        </section>
      )}

      {/* The compounding part. This is the whole reason recording more is worth it. */}
      {stats.clients.length > 0 && (
        <section className="pen-ov-sec">
          <div className="pen-label mb-1">What Pen has worked out</div>
          <p className="mb-4 text-[13.5px]" style={{ color: 'var(--dim)' }}>
            Built up across meetings, not from any single one. It sharpens every time you record.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {stats.clients.map((c) => (
              <article key={c.name} className="pen-ov-client">
                <header className="flex items-baseline justify-between gap-3">
                  <h3 className="pen-display text-[19px]">{c.name}</h3>
                  <span className="pen-mono text-[10px]" style={{ color: 'var(--faint)' }}>
                    {c.showings} meeting{c.showings === 1 ? '' : 's'}
                  </span>
                </header>
                <Facet label="Must have" items={c.profile.must_haves} />
                <Facet label="Dealbreakers" items={c.profile.dealbreakers} tone="bad" />
                <Facet label="Never said outright" items={c.profile.revealed_criteria} tone="accent" />
                <Facet label="Still unknown" items={c.profile.open_questions} />
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="pen-ov-tile">
      <div className="pen-label">{label}</div>
      {/* Mono, not the display serif — a serif figure reads as decoration, not data. */}
      <div
        className="pen-mono mt-2 text-[30px] leading-none"
        style={{ color: tone === 'warn' ? 'var(--warn)' : tone === 'good' ? 'var(--good)' : 'var(--ink)' }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--dim)' }}>{sub}</div>
    </div>
  )
}

function Facet({ label, items, tone }: { label: string; items?: string[]; tone?: 'bad' | 'accent' }) {
  if (!items?.length) return null
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'accent' ? 'var(--accent-ink)' : 'var(--soft)'
  return (
    <div className="mt-3.5">
      <div className="pen-mono text-[9.5px] uppercase tracking-[.12em]" style={{ color }}>{label}</div>
      <ul className="mt-1 space-y-1">
        {items.slice(0, 4).map((t) => (
          <li key={t} className="text-[14px] leading-snug">{t}</li>
        ))}
      </ul>
    </div>
  )
}

function EmptyArchive() {
  return (
    <div className="pen-panel px-8 py-14 text-center">
      <h2 className="pen-display text-[24px]">Nothing recorded yet</h2>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed" style={{ color: 'var(--soft)' }}>
        Plug the pen in and import one recording. From the second one on, Pen starts joining
        them up: what the same people keep asking for, what you keep forgetting, what is still
        outstanding across everything.
      </p>
    </div>
  )
}
