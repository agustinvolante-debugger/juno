import { KeywordCAC } from '@/types'

interface DigestEmailProps {
  userEmail: string
  keywords: KeywordCAC[]
  weekOf: string
}

export function buildDigestHtml({ userEmail, keywords, weekOf }: DigestEmailProps): string {
  const toScale = keywords.filter((k) => k.action === 'scale')
  const toCut = keywords.filter((k) => k.action === 'cut')
  const toMonitor = keywords.filter((k) => k.action === 'monitor')

  const totalSpend = keywords.reduce((s, k) => s + k.spend_monthly, 0)
  const budgetToCut = toCut.reduce((s, k) => s + k.spend_monthly, 0)
  const pctWasted = totalSpend > 0 ? Math.round((budgetToCut / totalSpend) * 100) : 0

  const sourceLabel = (kw: KeywordCAC) => {
    if (kw.source_type === 'dsa_search_term') return ' <span style="background:#4a9aea18;color:#4a9aea;padding:1px 5px;border-radius:3px;font-size:9px;font-family:monospace;font-weight:600">DSA</span>'
    if (kw.source_type === 'pmax_search_term') return ' <span style="background:#a855f718;color:#a855f7;padding:1px 5px;border-radius:3px;font-size:9px;font-family:monospace;font-weight:600">PMAX</span>'
    if (kw.source_type === 'asset_group') return ' <span style="background:#8a867818;color:#8a8678;padding:1px 5px;border-radius:3px;font-size:9px;font-family:monospace;font-weight:600">AG</span>'
    return ''
  }

  const kwRow = (kw: KeywordCAC) => {
    const actionColor = kw.action === 'scale' ? '#5ab87a' : kw.action === 'monitor' ? '#e09a30' : '#e05a4a'
    const actionLabel = kw.action === 'scale' ? 'Scale' : kw.action === 'monitor' ? 'Monitor' : 'Cut now'
    return `
      <tr>
        <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#f0ead2;border-bottom:1px solid #222220">${kw.keyword}${sourceLabel(kw)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#8a8678;border-bottom:1px solid #222220">$${kw.spend_monthly.toLocaleString()}</td>
        <td style="padding:10px 12px;font-size:13px;color:${kw.deal_count > 0 ? '#5ab87a' : '#e05a4a'};font-weight:600;border-bottom:1px solid #222220">${kw.deal_count}</td>
        <td style="padding:10px 12px;font-size:13px;color:${actionColor};font-weight:500;border-bottom:1px solid #222220">${kw.cac !== null ? '$' + kw.cac.toLocaleString() : '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #222220">
          <span style="background:${actionColor}18;color:${actionColor};padding:3px 8px;border-radius:4px;font-size:11px;font-family:monospace;font-weight:600">${actionLabel}</span>
        </td>
      </tr>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c0c0b;font-family:'DM Sans',Arial,sans-serif;color:#f0ead2">
  <div style="max-width:680px;margin:0 auto;padding:40px 24px">

    <!-- Header -->
    <div style="margin-bottom:40px">
      <div style="font-size:24px;font-weight:600;color:#f0ead2;margin-bottom:4px">juno<span style="color:#c8f04a">.</span></div>
      <div style="font-size:12px;font-family:monospace;color:#4a4840;text-transform:uppercase;letter-spacing:0.15em">Weekly attribution digest · ${weekOf}</div>
    </div>

    <!-- Summary stats -->
    <div style="display:flex;gap:16px;margin-bottom:32px">
      <div style="flex:1;background:#141412;border:1px solid #222220;border-radius:10px;padding:20px">
        <div style="font-size:10px;font-family:monospace;color:#4a4840;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px">Total spend/mo</div>
        <div style="font-size:26px;font-weight:600;color:#f0ead2">$${totalSpend.toLocaleString()}</div>
      </div>
      <div style="flex:1;background:#141412;border:1px solid #222220;border-radius:10px;padding:20px">
        <div style="font-size:10px;font-family:monospace;color:#4a4840;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px">Budget to cut</div>
        <div style="font-size:26px;font-weight:600;color:#e05a4a">$${budgetToCut.toLocaleString()}</div>
      </div>
      <div style="flex:1;background:#141412;border:1px solid #222220;border-radius:10px;padding:20px">
        <div style="font-size:10px;font-family:monospace;color:#4a4840;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px">Wasted spend</div>
        <div style="font-size:26px;font-weight:600;color:#e05a4a">${pctWasted}%</div>
      </div>
    </div>

    ${toCut.length > 0 ? `
    <!-- Cut these -->
    <div style="background:#e05a4a10;border:1px solid #e05a4a30;border-radius:10px;padding:20px;margin-bottom:24px">
      <div style="font-size:12px;font-family:monospace;color:#e05a4a;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:12px">● Cut these now — $${budgetToCut.toLocaleString()}/mo with zero pipeline</div>
      ${toCut.map((k) => `<div style="font-family:monospace;font-size:13px;color:#f0ead2;padding:6px 0;border-bottom:1px solid #e05a4a15">"${k.keyword}" — $${k.spend_monthly.toLocaleString()}/mo · 0 deals</div>`).join('')}
    </div>` : ''}

    ${toScale.length > 0 ? `
    <!-- Scale these -->
    <div style="background:#5ab87a10;border:1px solid #5ab87a30;border-radius:10px;padding:20px;margin-bottom:24px">
      <div style="font-size:12px;font-family:monospace;color:#5ab87a;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:12px">● Scale these — generating pipeline</div>
      ${toScale.map((k) => `<div style="font-family:monospace;font-size:13px;color:#f0ead2;padding:6px 0;border-bottom:1px solid #5ab87a15">"${k.keyword}" — $${k.spend_monthly.toLocaleString()}/mo · ${k.deal_count} deals · CAC $${k.cac?.toLocaleString()}</div>`).join('')}
    </div>` : ''}

    <!-- Full table -->
    <div style="background:#141412;border:1px solid #222220;border-radius:10px;overflow:hidden;margin-bottom:32px">
      <div style="padding:16px 20px;border-bottom:1px solid #222220">
        <div style="font-size:14px;font-weight:600">CAC by keyword — this week</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1a1a18">
            <th style="padding:10px 12px;font-family:monospace;font-size:10px;color:#4a4840;text-transform:uppercase;letter-spacing:0.12em;text-align:left;font-weight:400">Keyword</th>
            <th style="padding:10px 12px;font-family:monospace;font-size:10px;color:#4a4840;text-transform:uppercase;letter-spacing:0.12em;text-align:left;font-weight:400">Spend/mo</th>
            <th style="padding:10px 12px;font-family:monospace;font-size:10px;color:#4a4840;text-transform:uppercase;letter-spacing:0.12em;text-align:left;font-weight:400">Deals</th>
            <th style="padding:10px 12px;font-family:monospace;font-size:10px;color:#4a4840;text-transform:uppercase;letter-spacing:0.12em;text-align:left;font-weight:400">True CAC</th>
            <th style="padding:10px 12px;font-family:monospace;font-size:10px;color:#4a4840;text-transform:uppercase;letter-spacing:0.12em;text-align:left;font-weight:400">Action</th>
          </tr>
        </thead>
        <tbody>
          ${keywords.map(kwRow).join('')}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:12px;color:#4a4840;font-family:monospace">
      juno · San Francisco, CA · <a href="mailto:chaska@caerusai.com" style="color:#4a4840">chaska@caerusai.com</a>
    </div>

  </div>
</body>
</html>`
}
