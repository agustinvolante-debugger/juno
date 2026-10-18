import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getDigestRecipients, getPrefs } from '@/lib/news/store'
import { sendEmail } from '@/lib/news/email'
import { buildDigestHtml, digestSubject, langOf, type Lang } from '@/lib/news/digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET: cron — emails every opted-in user, each in their language. Protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const recipients = await getDigestRecipients()
  const html: Partial<Record<Lang, string | null>> = {}
  let sent = 0
  for (const r of recipients) {
    const lang = langOf(r.lang)
    if (!(lang in html)) html[lang] = await buildDigestHtml(lang)
    const body = html[lang]
    if (body && (await sendEmail({ to: r.email, subject: digestSubject(lang), html: body }))) sent++
  }
  if (!Object.values(html).some(Boolean) && recipients.length) return NextResponse.json({ ok: false, error: 'no content' })
  return NextResponse.json({ ok: true, recipients: recipients.length, sent })
}

// POST: signed-in user sends today's digest to themselves now (test / on-demand), in their language.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const lang = langOf((await getPrefs(email)).lang)
  const html = await buildDigestHtml(lang)
  if (!html) return NextResponse.json({ ok: false, error: 'no content' }, { status: 400 })
  const ok = await sendEmail({ to: email, subject: digestSubject(lang), html })
  return NextResponse.json({ ok, to: email })
}
