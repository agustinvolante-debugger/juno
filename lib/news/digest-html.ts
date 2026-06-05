// Builds the daily email digest HTML from the shared curated sections. Email-safe inline
// styles, monochrome to match the dashboard. Kept dependency-free.
type DItem = { t: string; l: string; s: string }
type DSection = { label: string; brief: string; items: DItem[] }

const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildNewsDigestHtml(opts: { sections: DSection[]; dateStr: string; appUrl: string }): string {
  const { sections, dateStr, appUrl } = opts
  const blocks = sections.map((sec) => {
    const items = sec.items.slice(0, 5).map((it) =>
      `<tr><td style="padding:5px 0;border-top:1px solid #eee">
         <a href="${esc(it.l)}" style="color:#111;text-decoration:none;font-weight:600;font-size:14px">${esc(it.t)}</a>
         <div style="color:#888;font-size:11px;margin-top:2px">${esc(it.s)}</div>
       </td></tr>`).join('')
    const brief = sec.brief
      ? `<div style="background:#f7f7f7;border-radius:6px;padding:10px 12px;margin:0 0 8px;font-size:13px;line-height:1.5;color:#333">
           <span style="font-size:10px;font-weight:700;letter-spacing:.5px;color:#999;text-transform:uppercase">What matters</span> ${esc(sec.brief)}</div>`
      : ''
    return `<div style="margin:0 0 26px">
      <div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">${esc(sec.label)}</div>
      ${brief}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${items}</table>
    </div>`
  }).join('')

  return `<!doctype html><html><body style="margin:0;background:#fff">
    <div style="max-width:600px;margin:0 auto;padding:28px 22px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
      <div style="border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:22px">
        <span style="font-size:22px;font-weight:800">▦ Daily Brief</span>
        <span style="color:#888;font-size:13px;margin-left:8px">${esc(dateStr)}</span>
      </div>
      ${blocks}
      <div style="border-top:1px solid #eee;padding-top:14px;color:#888;font-size:12px">
        <a href="${esc(appUrl)}" style="color:#111;font-weight:600">Open the dashboard →</a>
        <div style="margin-top:6px">You're getting this because you turned on the daily email in Daily Brief. Toggle it off there anytime.</div>
      </div>
    </div>
  </body></html>`
}
