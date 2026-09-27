'use client'

import type { Allowance } from '@/lib/pen/allowance'
import { INCLUDED_HOURS, PLAN_TZ, fmtHours } from '@/lib/pen/plan'
import { useCopy, useLang } from './LangContext'
import { shortDate, type Copy } from '@/lib/pen/i18n'

const UB_EN = {
  head: 'Recording this month',
  unlimited: 'recorded · unlimited',
  aria: 'Recording hours used against the fair-use limit',
  out: (h: number, d: string) => `You've passed the ${h}-hour fair-use limit. New recordings are saved and wait until ${d}. Reply to any Juno Pen email if you need more.`,
  near: (h: number, left: string, d: string) => `Near the ${h}-hour fair-use limit: ${left} left until ${d}.`,
  counts: (d: string) => `Counts from the 1st. Resets ${d}.`,
  bought: (h: string) => `Plus ${h} of bought hours, which never expire.`,
  held: (n: number) => `${n} ${n === 1 ? 'recording is' : 'recordings are'} waiting for the month to reset.`,
  paused: (d: string) => `Your plan is paused until ${d}.`,
  heldPaused: (n: number) => `${n} ${n === 1 ? 'recording is' : 'recordings are'} waiting for the pause to end.`,
}

const UB: Copy<typeof UB_EN> = {
  en: UB_EN,
  es: {
    head: 'Grabado este mes',
    unlimited: 'grabado · ilimitado',
    aria: 'Horas grabadas frente al límite de uso justo',
    out: (h, d) => `Pasaste el límite de uso justo de ${h} horas. Las grabaciones nuevas quedan guardadas y esperan hasta el ${d}. Si necesitas más, responde a cualquier correo de Juno Pen.`,
    near: (h, left, d) => `Cerca del límite de uso justo de ${h} horas: quedan ${left} hasta el ${d}.`,
    counts: (d) => `Cuenta desde el día 1. Se reinicia el ${d}.`,
    bought: (h) => `Más ${h} de horas compradas, que no vencen.`,
    held: (n) => (n === 1 ? '1 grabación espera a que empiece el mes.' : `${n} grabaciones esperan a que empiece el mes.`),
    paused: (d) => `Tu plan está en pausa hasta el ${d}.`,
    heldPaused: (n) => (n === 1 ? '1 grabación espera a que termine la pausa.' : `${n} grabaciones esperan a que termine la pausa.`),
  },
  pt: {
    head: 'Gravado este mês',
    unlimited: 'gravado · ilimitado',
    aria: 'Horas gravadas em relação ao limite de uso justo',
    out: (h, d) => `Você passou do limite de uso justo de ${h} horas. As gravações novas ficam salvas e esperam até ${d}. Se precisar de mais, responda a qualquer e-mail do Juno Pen.`,
    near: (h, left, d) => `Perto do limite de uso justo de ${h} horas: faltam ${left} até ${d}.`,
    counts: (d) => `Conta a partir do dia 1. Reinicia em ${d}.`,
    bought: (h) => `Mais ${h} de horas compradas, que não expiram.`,
    held: (n) => (n === 1 ? '1 gravação está esperando o mês virar.' : `${n} gravações estão esperando o mês virar.`),
    paused: (d) => `Seu plano está pausado até ${d}.`,
    heldPaused: (n) => (n === 1 ? '1 gravação está esperando a pausa terminar.' : `${n} gravações estão esperando a pausa terminar.`),
  },
}

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
  const T = useCopy(UB)
  const lang = useLang()
  if (!allowance) return null
  const a = allowance
  const usedIncluded = a.includedSec - a.includedLeftSec
  const pct = Math.min(100, (usedIncluded / a.includedSec) * 100)
  const out = !a.uncapped && a.remainingSec <= 0
  const close = !out && !a.uncapped && a.remainingSec <= 3600
  const tone = out ? 'over' : close ? 'close' : 'ok'
  const resets = shortDate(a.resetsAt, lang, PLAN_TZ)

  return (
    <div className="pen-meter" data-tone={tone}>
      <div className="pen-meter-head">
        <span className="pen-label">{T.head}</span>
      </div>
      <div className="pen-meter-n">
        <strong>{fmtHours(a.usedThisMonthSec)}</strong>
        <span className="pen-meter-un">{T.unlimited}</span>
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
          aria-label={T.aria}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="pen-meter-sub">
        {a.pausedUntil
          ? T.paused(shortDate(a.pausedUntil, lang, PLAN_TZ))
          : out
          ? T.out(INCLUDED_HOURS, resets)
          : close || (!a.uncapped && pct >= 80)
            ? T.near(INCLUDED_HOURS, fmtHours(a.includedLeftSec), resets)
            : T.counts(resets)}
      </div>
      {a.boughtLeftSec > 0 && (
        <div className="pen-meter-sub">{T.bought(fmtHours(a.boughtLeftSec))}</div>
      )}
      {a.heldCount > 0 && (
        <div className="pen-meter-sub pen-meter-held">
          {a.pausedUntil ? T.heldPaused(a.heldCount) : T.held(a.heldCount)}
        </div>
      )}
    </div>
  )
}
