// One-time setup + deploy to Cloudflare:
//   1. creates the D1 database and R2 bucket (or reuses them) and writes the database id into wrangler.toml
//      (copied from wrangler.example.toml if it doesn't exist yet)
//   2. creates the tables
//   3. builds the frontend and deploys the Worker
//   4. copies the Serper API key from appsettings.Local.json into a Worker secret (if present)
// Run from the worker folder:  npm run setup   (after `npx wrangler login`)
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = 'makeup-organizer'
const BUCKET = 'makeup-organizer-images'

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`)
  return execSync(cmd, { cwd: root, stdio: opts.capture ? ['pipe', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', input: opts.input })
}
const wrangler = (args, opts) => run(`npx wrangler ${args}`, opts)

// 0. own config file (git-ignored) from the template
const tomlPath = join(root, 'wrangler.toml')
if (!existsSync(tomlPath)) {
  copyFileSync(join(root, 'wrangler.example.toml'), tomlPath)
  console.log('Created wrangler.toml from wrangler.example.toml')
}

// logged in?
try {
  wrangler('whoami', { capture: true })
} catch {
  console.error('\nNot logged in to Cloudflare. Run:  npx wrangler login   then run this again.')
  process.exit(1)
}

// 1. D1 database
let dbId
const list = JSON.parse(wrangler('d1 list --json', { capture: true }))
dbId = list.find(d => d.name === DB)?.uuid
if (!dbId) {
  wrangler(`d1 create ${DB}`)
  dbId = JSON.parse(wrangler('d1 list --json', { capture: true })).find(d => d.name === DB)?.uuid
}
if (!dbId) throw new Error('Could not find the D1 database id')
writeFileSync(tomlPath, readFileSync(tomlPath, 'utf8').replace(/database_id = ".*"/, `database_id = "${dbId}"`))
console.log(`D1 database: ${dbId} (saved to wrangler.toml)`)

// 2. R2 bucket (R2 must be enabled once in the dashboard: R2 Object Storage → Get started)
try {
  wrangler(`r2 bucket create ${BUCKET}`)
} catch {
  console.log('(bucket probably exists already, continuing)')
}

// 3. tables
wrangler(`d1 migrations apply ${DB} --remote`)

// 4. build + deploy
if (!existsSync(join(root, '..', 'client', 'node_modules'))) run('npm --prefix ../client install')
run('npm run deploy')

// 5. Serper key (picked up from the legacy PC version's appsettings.Local.json, if it's there)
const local = join(root, '..', 'server', 'MakeupOrganizer.Api', 'appsettings.Local.json')
if (existsSync(local)) {
  const key = JSON.parse(readFileSync(local, 'utf8'))?.Serper?.ApiKey
  if (key && !key.includes('paste-your')) {
    wrangler('secret put SERPER_API_KEY', { input: key, capture: true })
    console.log('Serper API key saved as a Worker secret.')
  }
} else {
  console.log('\nNo appsettings.Local.json found. To enable image search later:  npx wrangler secret put SERPER_API_KEY')
}

console.log(`
Done! Next:
  - Set a password so only you can open it:   npm run set-password
  - Only if you have data from the legacy PC version:   npm run migrate-data`)
