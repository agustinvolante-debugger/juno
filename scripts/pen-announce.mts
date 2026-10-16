// Send a "what's new" email (lib/pen/announcements). Touches production: run from the repo root.
//
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --test [email]   one copy, not logged
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --dry            who would get it
//   npx tsx --env-file=.env.local scripts/pen-announce.mts <slug> --send           everyone who hasn't
//   … --send --only=a@x.com,b@y.com --name=b@y.com:Chris                             only those (names override the greeting)
import { findAnnouncement, ANNOUNCEMENTS } from '../lib/pen/announcements'
import { sendTest, sendToAll } from '../lib/pen/announce'

const [slug, mode, arg] = process.argv.slice(2)
const flag = (k: string) => process.argv.find((x) => x.startsWith(`--${k}=`))?.slice(k.length + 3)
const only = flag('only')?.split(',').map((e) => e.trim()).filter(Boolean)
const names = Object.fromEntries(process.argv.filter((x) => x.startsWith('--name=')).map((x) => x.slice(7).split(':')).map(([e, n]) => [e.toLowerCase(), n]))
const a = slug ? findAnnouncement(slug) : undefined
if (!a) {
  console.log(`Unknown announcement "${slug ?? ''}". Registered: ${ANNOUNCEMENTS.map((x) => x.slug).join(', ') || '(none)'}`)
  process.exit(1)
}
if (mode === '--test') {
  const to = arg || process.env.PEN_SIGNUP_NOTIFY
  if (!to) throw new Error('no test address')
  console.log(await sendTest(a, to, names[to.toLowerCase()] ?? null), '→', to)
} else if (mode === '--dry') {
  console.log(await sendToAll(a, { dryRun: true, only, names }))
} else if (mode === '--send') {
  console.log(JSON.stringify(await sendToAll(a, { only, names }), null, 2))
} else {
  console.log('Pick --test [email], --dry or --send')
}
