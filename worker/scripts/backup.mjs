// Backs up the Cloudflare version to backups/<date>/ (next to worker/, git-ignored):
//   database.sql  the whole D1 database (items + settings), restorable with `wrangler d1 execute --file`
//   images/       every picture an item uses
// Pictures already saved by an earlier backup are copied from there instead of downloaded again,
// so only the first run is slow. Run from the worker folder:  npm run backup
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = 'makeup-organizer'
const BUCKET = 'makeup-organizer-images'
const backups = join(root, '..', 'backups')
const stamp = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD, local time
const dir = join(backups, stamp)
const imgDir = join(dir, 'images')
mkdirSync(imgDir, { recursive: true })

const wrangler = (args, capture = false) =>
  execSync(`npx wrangler ${args}`, { cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' })

// 1. database
console.log('Exporting the database…')
wrangler(`d1 export ${DB} --remote --output="${join(dir, 'database.sql')}"`)

// 2. pictures that items use
const out = wrangler(`d1 execute ${DB} --remote --json --command="SELECT DISTINCT json_extract(data, '$.imagePath') AS path FROM products WHERE json_extract(data, '$.imagePath') IS NOT NULL"`, true)
const rows = JSON.parse(out.slice(out.indexOf('['))).flatMap(r => r.results ?? [])
const names = rows.map(r => String(r.path ?? '').replace(/^\/images\//, '')).filter(n => /^[\w.-]+$/.test(n))

// earlier backups, newest first, to reuse pictures from
const earlier = existsSync(backups)
  ? readdirSync(backups).filter(d => d !== stamp && existsSync(join(backups, d, 'images'))).sort().reverse()
  : []

let copied = 0, downloaded = 0, failed = 0
for (const [i, name] of names.entries()) {
  const target = join(imgDir, name)
  if (existsSync(target)) continue
  const old = earlier.map(d => join(backups, d, 'images', name)).find(p => existsSync(p))
  if (old) { copyFileSync(old, target); copied++; continue }
  console.log(`Downloading picture ${i + 1} of ${names.length}: ${name}`)
  try {
    wrangler(`r2 object get "${BUCKET}/${name}" --remote --file="${target}"`, true)
    downloaded++
  } catch {
    console.error(`  couldn't download ${name}`)
    failed++
  }
}

console.log(`\nBackup saved to ${dir}`)
console.log(`  database.sql + ${names.length} pictures (${downloaded} downloaded, ${copied} copied from an earlier backup${failed ? `, ${failed} failed` : ''})`)
