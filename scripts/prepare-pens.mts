// Gets every Juno Pen plugged into this Mac ready to ship (22 Oct): renamed JUNO (the factory name
// is USB-DISK), clock set to now, factory settings written (High quality, normal microphone, voice
// activation off, 60-minute parts), the maker's Windows clock tool and the Mac's leftovers removed.
// With --clear-recordings, the test recordings in RECORD/ go too. Dry run unless --yes.
//
//   npx tsx scripts/prepare-pens.mts                      (dry run: lists the pens, changes nothing)
//   npx tsx scripts/prepare-pens.mts --yes                (prepare them)
//   npx tsx scripts/prepare-pens.mts --yes --clear-recordings
//
// A pen = a mounted volume with MRECSET.TXT at its root and a RECORD folder (lib/pen/pen-device.ts).
// The settings file is rewritten with lib/pen/pen-settings.ts, which keeps its shape (comments, line
// endings, length). The pen reads it when it powers on, so unplug each pen once after this runs.
// Several pens at once all get the name JUNO (macOS mounts them as "JUNO", "JUNO 1", …).

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PEN_DEFAULTS } from '../lib/pen/pen-device'
import { penSettingsToKeys, timeLine, writeMrecset } from '../lib/pen/pen-settings'

const GO = process.argv.includes('--yes')
const CLEAR = process.argv.includes('--clear-recordings')
const NAME = 'JUNO'
const JUNK = ['Time Sync Tool.exe', '._MRECSET.TXT', '._Time Sync Tool.exe', '.Trashes', '.Spotlight-V100', '.fseventsd']

const isPen = (dir: string) => existsSync(join(dir, 'MRECSET.TXT')) && existsSync(join(dir, 'RECORD')) && statSync(join(dir, 'RECORD')).isDirectory()
const pens = readdirSync('/Volumes').map((v) => join('/Volumes', v)).filter((d) => d !== '/Volumes/Macintosh HD' && isPen(d))

if (!pens.length) {
  console.log('No Juno Pen found. Plug one in (it shows up as JUNO or USB-DISK) and run this again.')
  process.exit(0)
}

console.log(`${pens.length} pen${pens.length === 1 ? '' : 's'} found${GO ? '' : ' (dry run: add --yes to prepare them)'}:\n`)

for (const dir of pens) {
  const recordings = readdirSync(join(dir, 'RECORD')).filter((f) => /\.(wav|mp3)$/i.test(f) && !f.startsWith('._'))
  const junk = JUNK.filter((f) => existsSync(join(dir, f)))
  console.log(`• ${dir}`)
  console.log(`    rename to ${NAME}${dir.endsWith(`/${NAME}`) ? ' (already)' : ''}`)
  console.log(`    clock → ${timeLine(new Date())}, settings → High quality, normal microphone, voice activation off, 60-min parts`)
  if (junk.length) console.log(`    remove: ${junk.join(', ')}`)
  if (recordings.length) console.log(`    ${recordings.length} recording${recordings.length === 1 ? '' : 's'} in RECORD/${CLEAR ? ' → removed' : ' (kept; --clear-recordings removes them)'}`)
  if (!GO) continue

  // Settings first, while the volume is still at this path.
  const file = join(dir, 'MRECSET.TXT')
  const now = new Date()
  writeFileSync(file, writeMrecset(readFileSync(file, 'latin1'), { TIME: timeLine(now), ...penSettingsToKeys(PEN_DEFAULTS) }), 'latin1')
  for (const f of junk) rmSync(join(dir, f), { recursive: true, force: true })
  if (CLEAR) for (const f of readdirSync(join(dir, 'RECORD'))) rmSync(join(dir, 'RECORD', f), { recursive: true, force: true })
  if (!dir.endsWith(`/${NAME}`)) execFileSync('diskutil', ['rename', dir, NAME], { stdio: 'ignore' })
  console.log(`    ✓ Pen ready. Eject it and unplug it once so it takes the clock and settings.`)
}
if (!GO) console.log('\nNothing changed.')
