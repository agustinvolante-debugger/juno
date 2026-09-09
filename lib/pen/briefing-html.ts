// Feature 4 — the post-meeting briefing email.
//
// Email-safe by construction: inline styles only, tables for layout, no external CSS, no
// webfonts (the serif stack degrades to Georgia everywhere). Dependency-free, same as
// lib/news/digest-html.ts.
//
// PRIVACY NOTE: this is the one part of the product that pushes note content to a third
// party (Resend) and into a mail server. The extraction already strips identifiers and keeps
// clinical detail out of the notes, which is exactly why that mattered.
import type { PenNotes } from './store'

const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PAPER = '#FBFAF6'
const INK = '#16150F'
const SOFT = '#514E45'
const DIM = '#858175'
const LINE = '#E7E3D9'
const ACCENT = '#2C5F7C'
const WARN = '#8A6516'
const WARN_BG = '#FBF5E8'

// NOTE: text here is escaped, so pass literal Unicode (→ · ) and never HTML entities —
// esc() turns "&rarr;" into "&amp;rarr;" and it renders as visible markup.
function label(text: string, color = DIM) {
  return `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:${color};margin:0 0 8px">${esc(text)}</div>`
}

function section(inner: string) {
  return `<tr><td style="padding:22px 0 0;border-top:1px solid ${LINE}">${inner}</td></tr>`
}

export function buildBriefingHtml(opts: {
  notes: PenNotes
  title: string
  dateStr: string
  clientName?: string | null
  durationStr: string
  appUrl: string
  actionDone: number[]
}): string {
  const { notes: n, title, dateStr, clientName, durationStr, appUrl } = opts
  const done = new Set(opts.actionDone)
  const rows: string[] = []

  if (n.summary) {
    rows.push(
      section(
        `${label('Summary')}<div style="font-size:16px;line-height:1.62;color:${INK}">${esc(n.summary)}</div>`,
      ),
    )
  }

  // Ordered deliberately: what you nearly dropped comes before your to-do list, because it
  // is the part you cannot reconstruct from memory.
  if (n.missed?.length) {
    const items = n.missed
      .map(
        (m) =>
          `<div style="margin:0 0 12px">
             <div style="font-size:15px;line-height:1.45;color:${INK}">${esc(m.item)}</div>
             ${m.why ? `<div style="font-size:13px;line-height:1.45;color:${WARN};margin-top:3px">${esc(m.why)}</div>` : ''}
           </div>`,
      )
      .join('')
    rows.push(
      section(
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${WARN_BG};border:1px solid #EFE2C4;border-radius:10px">
           <tr><td style="padding:16px 18px">${label('You might have missed', WARN)}${items}</td></tr>
         </table>`,
      ),
    )
  }

  if (n.actions?.length) {
    const items = n.actions
      .map((a, i) => {
        const struck = done.has(i)
        const meta = [a.priority === 'high' ? 'PRIORITY' : '', a.owner, a.due].filter(Boolean).join(' &middot; ')
        return `<tr>
          <td width="18" valign="top" style="padding:8px 0;font-size:14px;color:${struck ? '#B0ABA0' : ACCENT}">${struck ? '&#10003;' : '&#9633;'}</td>
          <td valign="top" style="padding:8px 0;border-bottom:1px solid ${LINE}">
            <div style="font-size:15px;line-height:1.45;color:${struck ? '#B0ABA0' : INK};${struck ? 'text-decoration:line-through' : ''}">${esc(a.action)}</div>
            ${meta ? `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:${DIM};margin-top:3px">${meta}</div>` : ''}
          </td></tr>`
      })
      .join('')
    rows.push(
      section(
        `${label(`Next actions \u00B7 ${n.actions.length - done.size} outstanding`)}
         <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${items}</table>`,
      ),
    )
  }

  if (n.open_questions?.length) {
    const items = n.open_questions
      .map((q) => `<li style="font-size:15px;line-height:1.5;color:${INK};margin:0 0 6px">${esc(q)}</li>`)
      .join('')
    rows.push(section(`${label('Still open')}<ul style="margin:0;padding-left:20px">${items}</ul>`))
  }

  if (n.people?.length) {
    const chips = n.people
      .map((p) => {
        const who = p.name || p.role || 'unknown'
        const sub = p.name && p.role ? ` &middot; ${esc(p.role)}` : ''
        return `<span style="display:inline-block;font-size:13px;color:${SOFT};border:1px solid ${LINE};border-radius:999px;padding:4px 11px;margin:0 5px 5px 0">${esc(who)}${sub}</span>`
      })
      .join('')
    rows.push(section(`${label('In the room')}<div>${chips}</div>`))
  }

  if (!rows.length) {
    rows.push(
      section(
        `<div style="font-size:15px;color:${SOFT}">There are no notes on this recording yet, so there is nothing to brief.</div>`,
      ),
    )
  }

  const meta = [dateStr, durationStr, clientName || ''].filter(Boolean).join(' &nbsp;&middot;&nbsp; ')

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${PAPER}">
  <div style="display:none;max-height:0;overflow:hidden">${esc(n.summary?.slice(0, 130) ?? title)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border-collapse:collapse">
    <tr><td align="center" style="padding:28px 16px 44px">
      <table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;font-family:Georgia,'Iowan Old Style',Palatino,serif;color:${INK}">
        <tr><td style="padding:0 0 20px">
          ${label('Recorder \u2192 notes')}
          <div style="font-size:27px;line-height:1.16;letter-spacing:-0.3px">${esc(title)}</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:${DIM};margin-top:7px">${meta}</div>
        </td></tr>
        ${rows.join('')}
        <tr><td style="padding:26px 0 0;border-top:1px solid ${LINE}">
          <a href="${esc(appUrl)}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;padding:10px 16px;border-radius:8px">Open the full note &rarr;</a>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:${DIM};margin-top:14px;line-height:1.7">
            Sent because you pressed Send briefing on this recording.<br>
            Generated from the recording. Check anything before you act on it.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
