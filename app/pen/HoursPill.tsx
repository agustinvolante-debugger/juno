'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Allowance } from '@/lib/pen/allowance'
import { INCLUDED_HOURS, fmtHours } from '@/lib/pen/plan'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'
import Icon from './Icon'
import UsageBar from './UsageBar'

const HP_EN = {
  recorded: 'recorded this month',
  of: (h: number) => `of ${h}h`,
  aria: (t: string) => `${t} recorded this month. Show details`,
  allTime: (t: string, n: number) => `${t} in all, across ${n} ${n === 1 ? 'recording' : 'recordings'}.`,
}

const HP: Copy<typeof HP_EN> = {
  en: HP_EN,
  es: {
    recorded: 'grabadas este mes',
    of: (h) => `de ${h} h`,
    aria: (t) => `${t} grabadas este mes. Ver detalle`,
    allTime: (t, n) => `${t} en total, en ${n} ${n === 1 ? 'grabación' : 'grabaciones'}.`,
  },
  pt: {
    recorded: 'gravadas este mês',
    of: (h) => `de ${h} h`,
    aria: (t) => `${t} gravadas este mês. Ver detalhes`,
    allTime: (t, n) => `${t} no total, em ${n} ${n === 1 ? 'gravação' : 'gravações'}.`,
  },
}

/**
 * This month's recording, in the header between the search and the account chip. Read as a
 * total ("7h 43m recorded this month"), not a quota: every plan is unlimited with a fair-use
 * ceiling, so the ceiling ("of 100h") and the warm colour only appear near it. Click for the
 * month's detail, which is the same UsageBar the settings page shows, so the two never disagree.
 *
 * Hidden until there is a minute to show: "0m recorded" is a quota reading, not an achievement.
 */
export default function HoursPill({
  allowance,
  allTimeSec,
  recordings,
}: {
  allowance: Allowance | null
  allTimeSec: number
  recordings: number
}) {
  const T = useCopy(HP)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const popId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!allowance) return null
  const a = allowance
  const out = !a.uncapped && a.remainingSec <= 0
  const usedIncluded = a.includedSec - a.includedLeftSec
  const near = !a.uncapped && !out && usedIncluded / a.includedSec >= 0.8
  if (a.usedThisMonthSec < 60 && !out && !a.pausedUntil && !a.heldCount) return null
  const tone = out ? 'over' : near ? 'close' : 'ok'
  const used = fmtHours(a.usedThisMonthSec)

  return (
    <div className="pen-hrs" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="pen-hrs-btn"
        data-tone={tone}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={T.aria(used)}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="mic" size={16} className="pen-hrs-ic" />
        <span className="pen-hrs-n">{used}</span>
        {(near || out) && <span className="pen-hrs-of">{T.of(INCLUDED_HOURS)}</span>}
        <span className="pen-hrs-t">{T.recorded}</span>
      </button>
      {open && (
        <div className="pen-hrs-pop" id={popId} role="dialog" aria-label={T.aria(used)}>
          <UsageBar allowance={a} />
          {allTimeSec >= 60 && recordings > 0 && (
            <p className="pen-hrs-all">{T.allTime(fmtHours(allTimeSec), recordings)}</p>
          )}
        </div>
      )}
    </div>
  )
}
