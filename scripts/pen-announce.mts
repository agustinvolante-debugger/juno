// Send a "what's new" email (lib/pen/announcements). Touches production: run from the repo root.
//
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --test [email]   one copy, not logged
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --dry            who would get it
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --send           everyone who hasn't
import { findAnnouncement, ANNOUNCEMENTS } from '../lib/pen/announcements'
import { sendTest, sendToAll } from '../lib/pen/announce'

const [slug, mode, arg] = process.argv.slice(2)
const a = slug ? findAnnouncement(slug) : undefined
if (!a) {
  console.log(`Unknown announcement "${slug ?? ''}". Registered: ${ANNOUNCEMENTS.map((x) => x.slug).join(', ') || '(none)'}`)
  process.exit(1)
}
if (mode === '--test') {
  const to = arg || process.env.PEN_SIGNUP_NOTIFY
  if (!to) throw new Error('no test address')
  console.log(await sendTest(a, to), '→', to)
} else if (mode === '--dry') {
  console.log(await sendToAll(a, { dryRun: true }))
} else if (mode === '--send') {
  console.log(JSON.stringify(await sendToAll(a), null, 2))
} else {
  console.log('Pick --test [email], --dry or --send')
}
