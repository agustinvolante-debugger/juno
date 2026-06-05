import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getFeedCache, getSectionBriefs, getDigestRecipients } from '@/lib/news/store'
import { buildNewsDigestHtml } from '@/lib/news/digest-html'
import { sendEmail } from '@/lib/news/email'
import { SECTIONS, SECTION_QUERIES } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = 'https://news.tryjunoapp.com'
// Sections to include in the digest: the AI-curated ones (with briefs), in catalog order.
const DIGEST_SECTIONS = Object.keys(SECTION_QUERIES)

async function buildHtml(): Promise<string | null> {
  const [cache, briefs] = await Promise.all([getFeedCache(), getSectionBriefs()])
  const sections = DIGEST_SECTIONS
    .map((key) => ({
      label: SECTIONS.find((s) => s.key === key)?.label || key,
      brief: briefs[key] || '',
      items: (cache[key] || []).map((it) => ({ t: it.t, l: it.l, s: it.s })),
    }))
    .filter((s) => s.items.length)
  if (!sections.length) return null
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
  return buildNewsDigestHtml({ sections, dateStr, appUrl: APP_URL })
}

const subject = () => `▦ Daily Brief — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

// GET: cron — emails every opted-in user. Protected by CRON_SECRET (same as the feed cron).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const html = await buildHtml()
  if (!html) return NextResponse.json({ ok: false, error: 'no content' })
  const recipients = await getDigestRecipients()
  let sent = 0
  for (const to of recipients) if (await sendEmail({ to, subject: subject(), html })) sent++
  return NextResponse.json({ ok: true, recipients: recipients.length, sent })
}

// POST: signed-in user sends today's digest to themselves now (test / on-demand).
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const html = await buildHtml()
  if (!html) return NextResponse.json({ ok: false, error: 'no content' }, { status: 400 })
  const ok = await sendEmail({ to: email, subject: subject(), html })
  return NextResponse.json({ ok, to: email })
}
