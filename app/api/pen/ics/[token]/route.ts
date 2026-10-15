import { buildIcs, readToken } from '@/lib/pen/calendar'

export const dynamic = 'force-dynamic'

// "Tap to add it": the link under a WhatsApp "add to calendar" reply (lib/pen/calendar.ts).
// Served inline as text/calendar so iPhone Safari and the WhatsApp in-app browser show Apple
// Calendar's "Add to Calendar" sheet, and Android hands it to Google Calendar. The event is in
// the signed token itself, so the link needs no sign-in and nothing is stored.

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ev = readToken(token)
  if (!ev) {
    return new Response('This calendar link has expired or is not valid. Ask Juno on WhatsApp for a new one.\n', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(buildIcs(ev), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename=event.ics',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  })
}
