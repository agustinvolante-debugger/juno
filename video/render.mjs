// Renders the film to out/ through the Remotion CLI (which reads remotion.config.ts).
//   npm run render                      every version (24)
//   npm run render -- juno-en-sales-portrait juno-es-family-landscape
import { execFileSync } from 'node:child_process'

const list = () =>
  execFileSync('npx', ['remotion', 'compositions', 'src/index.ts', '--quiet'], { encoding: 'utf8' })
    .split(/\s+/)
    .filter((s) => s.startsWith('juno-'))
const ids = process.argv.slice(2).length ? process.argv.slice(2) : list()
for (const id of ids) {
  const t0 = Date.now()
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${id}.mp4`, '--crf=20', '--log=error'], { stdio: 'inherit' })
  console.log(`${id} → out/${id}.mp4 (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
