// Local iMessage test (Sendblue free sandbox, 14 Oct 2026). Sendblue normally pushes each message
// to a public webhook; localhost has none and must not be tunnelled (it signs in automatically),
// so this asks Sendblue for new messages every few seconds and hands them to the same bot the
// WhatsApp webhook uses. It talks to the PRODUCTION database, like localhost does.
//
// Run:  cd ~/Downloads/juno-pen-hours && (set -a; . ./.env.local; set +a; npx tsx scripts/imessage-poll.ts)
// Stop: Ctrl+C (or pkill -f imessage-poll)

import { handleInbound } from '@/lib/pen/whatsapp/bot'
import { configured, inboundSince, toInbound } from '@/lib/pen/imessage/sendblue'

const EVERY_MS = 4000

async function main() {
  if (!configured()) throw new Error('SENDBLUE_API_KEY_ID / SENDBLUE_API_SECRET / SENDBLUE_NUMBER not set')
  // Start from now: never replay old messages. A small overlap is safe: the bot records each
  // message id first and ignores one it has already seen.
  let since = new Date(Date.now() - 60_000).toISOString()
  console.log(`imessage-poll: watching ${process.env.SENDBLUE_NUMBER} from ${since}`)
  for (;;) {
    try {
      const msgs = await inboundSince(since)
      for (const m of msgs) {
        const inbound = toInbound(m)
        if (m.date_sent && m.date_sent > since) since = m.date_sent
        if (!inbound) continue
        console.log(`imessage-poll: ${inbound.kind}${inbound.voice ? ' (voice)' : ''} from …${inbound.from.slice(-4)}`)
        // Handled one at a time, so a reply always follows the message it answers.
        await handleInbound(inbound).catch((e) => console.warn(`imessage-poll: ${inbound.id} failed: ${(e as Error).message}`))
      }
    } catch (e) {
      console.warn(`imessage-poll: ${(e as Error).message}`)
    }
    await new Promise((r) => setTimeout(r, EVERY_MS))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
