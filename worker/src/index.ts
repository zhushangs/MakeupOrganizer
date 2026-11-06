/**
 * Cloudflare Worker version of the backend (same API as server/MakeupOrganizer.Api):
 *   - products and settings in D1 (stored as JSON documents)
 *   - pictures in R2, served at /images/{name}
 *   - image search through Serper.dev (secret SERPER_API_KEY)
 * The frontend is served as static assets from the same Worker (see wrangler.toml).
 */

import { checkAuth } from './auth'
import { OTHER_RANK, preferredSites, rankSource, restrictToSites } from './sources'

export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ASSETS: Fetcher
  SERPER_API_KEY?: string
  /** password for the whole app (`npm run set-password`); if unset the app is blocked (except on localhost) */
  APP_PASSWORD?: string
  /** set to "1" to deliberately run without a password */
  ALLOW_OPEN?: string
  /** optional, for testing against a mock */
  SERPER_BASE_URL?: string
}

// ---------------------------------------------------------------- types

interface Swatch {
  hex?: string | null
  label?: string | null
  /** texture: satin / shimmer / metallic / glitter; null = matte */
  finish?: string | null
}

interface Product {
  id: string
  category: string
  brand: string
  name: string
  shadeName?: string | null
  imagePath?: string | null
  channel?: string | null
  originalPrice?: number | null
  paidPrice?: number | null
  currency?: string | null
  gridRows: number
  gridCols: number
  layout?: number[] | null
  swatches: Swatch[]
  noColor?: boolean
  /** marked with a heart: something the user likes / finds works well */
  favorite?: boolean
  notes?: string | null
  createdAt: string
  updatedAt: string
}

interface CategoryDef { key: string; label: string; multi: boolean; defaultRows: number; defaultCols: number }
interface AppSettings { categories: CategoryDef[]; brands: string[] }

const DEFAULT_CATEGORIES: CategoryDef[] = [
  { key: 'lipstick', label: 'Lipstick', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'lipgloss', label: 'Lip Gloss', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'eyeshadow', label: 'Eyeshadow', multi: true, defaultRows: 3, defaultCols: 3 },
  { key: 'blush', label: 'Blush', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'highlight', label: 'Highlight & Contour', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'base', label: 'Base', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'other', label: 'Other', multi: false, defaultRows: 1, defaultCols: 1 },
]

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
/** An upload request may be a little bigger than the picture itself (multipart headers and boundary) */
const MAX_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024
/** Give up on a picture download that takes longer than this */
const DOWNLOAD_TIMEOUT_MS = 15_000
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

// ---------------------------------------------------------------- helpers

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
const error = (message: string, status = 400) => json({ error: message }, status)
/** Most rows / columns a palette grid can have (e.g. a 1 × 12 palette) */
const MAX_GRID = 12
/** Color finishes the app knows; matte is stored as null */
const FINISHES = ['matte', 'satin', 'shimmer', 'metallic', 'glitter']
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(Number(n) || lo)))
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const optStr = (v: unknown) => str(v) || null
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)

/** Pictures sit behind the password, so browsers may cache them but shared caches/proxies must not */
const IMAGE_CACHE = 'private, max-age=31536000, immutable'

/** An error that becomes a response with this status (instead of a 500) */
class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** The request body as a JSON object; a malformed body is a 400, not a server error */
async function readJson<T extends object = Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  let v: unknown
  try { v = await req.json() } catch { throw new HttpError('The request body is not valid JSON') }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new HttpError('The request body must be a JSON object')
  return v as Partial<T>
}

/** Read a stream into memory, stopping (and cancelling it) as soon as it goes over `max` bytes */
async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<ArrayBuffer> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      throw new HttpError('Image is too large (over 15MB)', 413)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength }
  return out.buffer
}

/** The declared body size, or null if the header is missing or not a number */
function contentLength(headers: Headers): number | null {
  const v = headers.get('content-length')
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function readForm(req: Request): Promise<FormData> {
  try { return await req.formData() } catch { throw new HttpError('Expected a file upload') }
}

/** Keep a layout only if well-formed: right length, pans numbered in reading order, each pan a rectangle */
function validLayout(rows: number, cols: number, layout: unknown): number[] | null {
  if (!Array.isArray(layout) || layout.length !== rows * cols) return null
  let next = 0
  const box = new Map<number, { r0: number; c0: number; r1: number; c1: number; n: number }>()
  for (let i = 0; i < layout.length; i++) {
    const pan = layout[i]
    if (typeof pan !== 'number') return null
    const r = Math.floor(i / cols), c = i % cols
    const b = box.get(pan)
    if (!b) {
      if (pan !== next++) return null
      box.set(pan, { r0: r, c0: c, r1: r, c1: c, n: 1 })
    } else {
      b.r0 = Math.min(b.r0, r); b.c0 = Math.min(b.c0, c); b.r1 = Math.max(b.r1, r); b.c1 = Math.max(b.c1, c); b.n++
    }
  }
  for (const b of box.values()) if ((b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) !== b.n) return null
  return box.size === layout.length ? null : (layout as number[])
}

/** Same rules as ProductStore.Normalize in the C# version */
function normalizeProduct(input: any, id: string, createdAt: string): Product {
  const gridRows = clamp(input?.gridRows, 1, MAX_GRID)
  const gridCols = clamp(input?.gridCols, 1, MAX_GRID)
  const layout = validLayout(gridRows, gridCols, input?.layout)
  const pans = layout ? Math.max(...layout) + 1 : gridRows * gridCols
  const swatches: Swatch[] = (Array.isArray(input?.swatches) ? input.swatches : []).slice(0, pans).map((s: any) => {
    const hex = typeof s?.hex === 'string' && /^#[0-9a-f]{6}$/i.test(s.hex) ? s.hex.toLowerCase() : null
    const finish = FINISHES.includes(s?.finish) && s.finish !== 'matte' ? s.finish as string : null
    return { hex, label: optStr(s?.label), finish }
  })
  while (swatches.length < pans) swatches.push({ hex: null, label: null })
  const imagePath = typeof input?.imagePath === 'string' && /^\/images\/[\w.-]+$/.test(input.imagePath) ? input.imagePath : null
  return {
    id,
    category: str(input?.category) || 'other',
    brand: str(input?.brand),
    name: str(input?.name),
    shadeName: optStr(input?.shadeName),
    imagePath,
    channel: optStr(input?.channel),
    originalPrice: optNum(input?.originalPrice),
    paidPrice: optNum(input?.paidPrice),
    currency: optStr(input?.currency),
    gridRows,
    gridCols,
    layout,
    swatches,
    noColor: !!input?.noColor,
    favorite: !!input?.favorite,
    notes: optStr(input?.notes),
    createdAt,
    updatedAt: new Date().toISOString(),
  }
}

/** Same rules as SettingsStore.Normalize in the C# version */
function normalizeSettings(input: any): AppSettings {
  const seen = new Set<string>()
  let categories: CategoryDef[] = (Array.isArray(input?.categories) ? input.categories : [])
    .map((c: any) => {
      const label = str(c?.label)
      const multi = !!c?.multi
      let key = str(c?.key)
      if (!key) key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'c' + newId().slice(0, 8)
      return {
        key, label, multi,
        defaultRows: multi ? clamp(c?.defaultRows, 1, MAX_GRID) : 1,
        defaultCols: multi ? clamp(c?.defaultCols, 1, MAX_GRID) : 1,
      }
    })
    .filter((c: CategoryDef) => c.label && c.key !== 'all' && !seen.has(c.key.toLowerCase()) && seen.add(c.key.toLowerCase()))
  if (!categories.length) categories = DEFAULT_CATEGORIES
  if (!categories.some(c => c.key === 'other')) categories.push({ key: 'other', label: 'Other', multi: false, defaultRows: 1, defaultCols: 1 })

  const brandMap = new Map<string, string>()
  for (const b of Array.isArray(input?.brands) ? input.brands : []) {
    const t = str(b)
    if (t && !brandMap.has(t.toLowerCase())) brandMap.set(t.toLowerCase(), t)
  }
  const brands = [...brandMap.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  return { categories, brands }
}

// ---------------------------------------------------------------- data access

async function listProducts(env: Env): Promise<Product[]> {
  const { results } = await env.DB.prepare('SELECT data FROM products ORDER BY created_at DESC').all<{ data: string }>()
  return results.map(r => JSON.parse(r.data))
}

async function getProduct(env: Env, id: string): Promise<Product | null> {
  const row = await env.DB.prepare('SELECT data FROM products WHERE id = ?').bind(id).first<{ data: string }>()
  return row ? JSON.parse(row.data) : null
}

async function putProduct(env: Env, p: Product) {
  await env.DB.prepare(
    'INSERT INTO products (id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
    'ON CONFLICT(id) DO UPDATE SET data = ?2, updated_at = ?4',
  ).bind(p.id, JSON.stringify(p), p.createdAt, p.updatedAt).run()
}

async function isImageReferenced(env: Env, path: string) {
  const row = await env.DB.prepare("SELECT 1 FROM products WHERE json_extract(data, '$.imagePath') = ? LIMIT 1").bind(path).first()
  return !!row
}

async function deleteImageIfUnused(env: Env, path?: string | null) {
  if (!path?.startsWith('/images/')) return
  if (!(await isImageReferenced(env, path))) await env.IMAGES.delete(path.slice('/images/'.length))
}

async function saveImage(env: Env, buf: ArrayBuffer, contentType: string | null): Promise<string | null> {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  const ext = EXT_BY_TYPE[type]
  if (!ext) return null
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new HttpError('Image is too large (over 15MB)', 413)
  const name = crypto.randomUUID().replace(/-/g, '') + ext
  await env.IMAGES.put(name, buf, { httpMetadata: { contentType: type, cacheControl: IMAGE_CACHE } })
  return '/images/' + name
}

async function downloadImage(env: Env, url: string): Promise<string | null> {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const res = await fetch(u.toString(), {
      headers: { 'user-agent': UA, accept: 'image/jpeg,image/png,image/webp;q=0.9,image/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    const type = res.headers.get('content-type')
    const declared = contentLength(res.headers)
    // check what we can before reading the body, and never read more than the limit
    if (!res.ok || !res.body || !type?.startsWith('image/') || (declared !== null && declared > MAX_IMAGE_BYTES)) {
      await res.body?.cancel().catch(() => {})
      return null
    }
    return await saveImage(env, await readCapped(res.body, MAX_IMAGE_BYTES), type)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- image search (Serper.dev)

interface ImageHit {
  imageUrl: string; thumbnailUrl: string | null; title: string | null; source: string | null
  width: number | null; height: number | null
  /** page the picture is on */
  link: string | null
  /** 0 brand's own site, 1 Sephora/Ulta, 2 department store, 3 Temptalia, 4 anything else */
  rank: number
  /** short source name shown on the picture ("Official", "Sephora"…) */
  label: string | null
}

/** Fewer preferred-site results than this and the search is widened to everywhere */
const MIN_PREFERRED_HITS = 3

async function serperImages(env: Env, q: string, brand: string | null): Promise<ImageHit[]> {
  const res = await fetch(`${env.SERPER_BASE_URL || 'https://google.serper.dev'}/images`, {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_API_KEY!, 'content-type': 'application/json' },
    // num 10, not more: Serper bills a request for 11–100 results as 2 credits
    body: JSON.stringify({ q, num: 10 }),
  })
  if (!res.ok) {
    throw new HttpError(res.status === 401 || res.status === 403 ? 'The Serper API key was rejected.'
      : res.status === 429 ? 'Serper rate limit or free credits used up.' : `Image search failed (${res.status}).`)
  }
  const data = await res.json<{ images?: any[] }>()
  return sortHits((data.images ?? [])
    .filter(i => typeof i?.imageUrl === 'string' && i.imageUrl.startsWith('http'))
    .map(i => {
      const link = typeof i.link === 'string' ? i.link : null
      const { rank, label } = rankSource(link, i.imageUrl, brand)
      return {
        imageUrl: i.imageUrl, thumbnailUrl: i.thumbnailUrl ?? null, title: i.title ?? null,
        source: i.source ?? i.domain ?? null, width: i.imageWidth ?? null, height: i.imageHeight ?? null,
        link, rank, label,
      }
    }))
}

/** Best sources first; within a source, keep Google's order (Array.prototype.sort is stable) */
const sortHits = (hits: ImageHit[]) => [...hits].sort((a, b) => (a.rank ?? OTHER_RANK) - (b.rank ?? OTHER_RANK))

function mergeHits(first: ImageHit[], more: ImageHit[]) {
  const seen = new Set(first.map(h => h.imageUrl))
  return sortHits([...first, ...more.filter(h => !seen.has(h.imageUrl))])
}

// ---------------------------------------------------------------- routes

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '')
  const method = req.method

  // products
  if (path === '/api/products' && method === 'GET') return json(await listProducts(env))
  if (path === '/api/products' && method === 'POST') {
    const now = new Date().toISOString()
    const p = normalizeProduct(await readJson(req), newId(), now)
    await putProduct(env, p)
    return json(p, 201)
  }
  const m = /^\/api\/products\/([\w-]+)$/.exec(path)
  if (m) {
    const id = m[1]
    const existing = await getProduct(env, id)
    if (!existing) return error('Not found', 404)
    if (method === 'GET') return json(existing)
    if (method === 'PUT') {
      const p = normalizeProduct(await readJson(req), id, existing.createdAt)
      await putProduct(env, p)
      if (existing.imagePath !== p.imagePath) await deleteImageIfUnused(env, existing.imagePath)
      return json(p)
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
      await deleteImageIfUnused(env, existing.imagePath)
      return new Response(null, { status: 204 })
    }
  }

  // settings
  if (path === '/api/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM settings WHERE id = 1').first<{ data: string }>()
    return json(normalizeSettings(row ? JSON.parse(row.data) : { categories: DEFAULT_CATEGORIES, brands: [] }))
  }
  if (path === '/api/settings' && method === 'PUT') {
    const s = normalizeSettings(await readJson(req))
    await env.DB.prepare('INSERT INTO settings (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = ?1')
      .bind(JSON.stringify(s)).run()
    return json(s)
  }

  // images
  if (path === '/api/images' && method === 'POST') {
    // refuse an oversized upload before parsing it (parsing reads the whole body into memory)
    const declared = contentLength(req.headers)
    if (declared !== null && declared > MAX_UPLOAD_BODY_BYTES) return error('Image is too large (over 15MB)', 413)
    // no Content-Length (chunked upload): read it with the limit applied, then parse
    const form = await readForm(declared !== null || !req.body ? req : new Request(req.url, {
      method: 'POST',
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
      body: await readCapped(req.body, MAX_UPLOAD_BODY_BYTES),
    }))
    const file = form.get('file')
    if (!file || typeof file === 'string') return error('No file')
    const saved = await saveImage(env, await file.arrayBuffer(), file.type)
    return saved ? json({ path: saved }) : error('Unsupported image format')
  }
  if (path === '/api/images/from-url' && method === 'POST') {
    const body = await readJson<{ url: string; fallbackUrl: string }>(req)
    for (const u of [body.url, body.fallbackUrl]) {
      if (typeof u !== 'string' || !u) continue
      const saved = await downloadImage(env, u)
      if (saved) return json({ path: saved })
    }
    return error("Couldn't download that image. Try another one.")
  }

  // image search (Serper.dev)
  if (path === '/api/image-search/status' && method === 'GET') return json({ configured: !!env.SERPER_API_KEY })
  if (path === '/api/image-search' && method === 'POST') {
    const body = await readJson<{ query: string; brand: string; scope: string }>(req)
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    const brand = typeof body.brand === 'string' ? body.brand : null
    if (!query) return error('Enter something to search for')
    if (!env.SERPER_API_KEY) return error('Image search isn\'t set up yet. Add the SERPER_API_KEY secret (see README).')

    // "all": search everywhere (the user asked for more). Otherwise first only the brand's site, Sephora,
    // Ulta, department stores and Temptalia; if that finds almost nothing, also search everywhere.
    if (body.scope === 'all') return json({ hits: await serperImages(env, query, brand), scope: 'all' })
    const preferred = await serperImages(env, restrictToSites(query, preferredSites(brand)), brand)
    if (preferred.length >= MIN_PREFERRED_HITS) return json({ hits: preferred, scope: 'preferred' })
    const everywhere = await serperImages(env, query, brand)
    return json({ hits: mergeHits(preferred, everywhere), scope: 'expanded' })
  }

  return error('Not found', 404)
}

async function serveImage(env: Env, name: string): Promise<Response> {
  if (!/^[\w.-]+$/.test(name)) return new Response('Not found', { status: 404 })
  const obj = await env.IMAGES.get(name)
  if (!obj) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  // always private, also for pictures stored before this was changed (their R2 metadata says public)
  headers.set('cache-control', IMAGE_CACHE)
  return new Response(obj.body, { headers })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    try {
      const blocked = await checkAuth(req, env)
      if (blocked) return blocked
      if (url.pathname.startsWith('/api/')) return await handleApi(req, env, url)
      if (url.pathname.startsWith('/images/')) return await serveImage(env, decodeURIComponent(url.pathname.slice(8)))
      return env.ASSETS.fetch(req)
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status)
      // details go to the Worker log (`npx wrangler tail`), not to the client
      console.error(e)
      return error('Server error', 500)
    }
  },

  /** Daily: delete pictures that were uploaded/downloaded more than a day ago but never saved to an item */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    // One query for every picture in use: a query per picture would hit the free plan's
    // limit of 50 D1 queries per run once there are more than ~50 pictures.
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT json_extract(data, '$.imagePath') AS path FROM products WHERE json_extract(data, '$.imagePath') IS NOT NULL",
    ).all<{ path: string }>()
    const used = new Set(results.map(r => r.path.replace(/^\/images\//, '')))
    let cursor: string | undefined
    let deleted = 0
    do {
      const page = await env.IMAGES.list({ cursor, limit: 1000 })
      const stale = page.objects.filter(o => o.uploaded.getTime() < cutoff && !used.has(o.key)).map(o => o.key)
      if (stale.length) {
        await env.IMAGES.delete(stale) // one call for up to 1000 keys
        deleted += stale.length
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
    console.log(`Image cleanup: ${used.size} in use, ${deleted} unused deleted`)
  },
} satisfies ExportedHandler<Env>
