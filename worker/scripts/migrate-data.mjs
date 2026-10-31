// Copies the local data (server/MakeupOrganizer.Api/data) to Cloudflare:
// products.json + settings.json → D1, images/* → R2. Safe to run again (rows are upserted, images overwritten).
// Run from the worker folder:  npm run migrate-data
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const target = args.includes('--local') ? '--local' : '--remote' // --local: test against `wrangler dev`
const dataDir = args.find(a => !a.startsWith('--')) ?? join(root, '..', 'server', 'MakeupOrganizer.Api', 'data')
const DB = 'makeup-organizer'
const BUCKET = 'makeup-organizer-images'
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }

const wrangler = args => {
  console.log(`> npx wrangler ${args}`)
  execSync(`npx wrangler ${args}`, { cwd: root, stdio: 'inherit' })
}
const q = s => `'${String(s).replace(/'/g, "''")}'`

if (!existsSync(dataDir)) {
  console.error(`No data folder at ${dataDir}`)
  process.exit(1)
}

// The C# version stores PascalCase-free camelCase JSON already (System.Text.Json Web defaults)
const products = existsSync(join(dataDir, 'products.json')) ? JSON.parse(readFileSync(join(dataDir, 'products.json'), 'utf8')) : []
const settings = existsSync(join(dataDir, 'settings.json')) ? JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) : null

const sql = []
for (const p of products) {
  const created = p.createdAt ?? new Date().toISOString()
  const updated = p.updatedAt ?? created
  sql.push(`INSERT INTO products (id, data, created_at, updated_at) VALUES (${q(p.id)}, ${q(JSON.stringify(p))}, ${q(created)}, ${q(updated)}) ` +
    `ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at;`)
}
if (settings) sql.push(`INSERT INTO settings (id, data) VALUES (1, ${q(JSON.stringify(settings))}) ON CONFLICT(id) DO UPDATE SET data = excluded.data;`)

if (sql.length) {
  const file = join(mkdtempSync(join(tmpdir(), 'vanity-')), 'seed.sql')
  writeFileSync(file, sql.join('\n'))
  wrangler(`d1 execute ${DB} ${target} --yes --file="${file}"`)
  console.log(`${products.length} items${settings ? ' + settings' : ''} copied.`)
}

// Only upload pictures that items actually use
const used = new Set(products.map(p => p.imagePath).filter(Boolean).map(p => p.replace('/images/', '')))
const imgDir = join(dataDir, 'images')
const files = existsSync(imgDir) ? readdirSync(imgDir).filter(f => used.has(f)) : []
for (const f of files) {
  const type = TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream'
  wrangler(`r2 object put "${BUCKET}/${f}" ${target} --file="${join(imgDir, f)}" --content-type=${type} --cache-control="public, max-age=31536000, immutable"`)
}
console.log(`\nDone: ${products.length} items, ${files.length} pictures.`)
