import type { AppSettings, ImageSearchHit, ImageSearchResult, Product, ProductInput } from './types'

async function json<T>(res: Response): Promise<T> {
  // Cloudflare version with a password: the sign-in expired or was never done
  if (res.status === 401) {
    location.href = '/login'
    throw new Error('Please sign in')
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  list: () => fetch('/api/products').then(r => json<Product[]>(r)),
  get: (id: string) => fetch(`/api/products/${id}`).then(r => json<Product>(r)),
  create: (p: ProductInput) =>
    fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      .then(r => json<Product>(r)),
  update: (id: string, p: ProductInput) =>
    fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      .then(r => json<Product>(r)),
  remove: (id: string) => fetch(`/api/products/${id}`, { method: 'DELETE' }).then(r => json<void>(r)),
  getSettings: () => fetch('/api/settings').then(r => json<AppSettings>(r)),
  saveSettings: (s: AppSettings) =>
    fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
      .then(r => json<AppSettings>(r)),
  searchStatus: () => fetch('/api/image-search/status').then(r => json<{ configured: boolean }>(r)),
  searchImages: (query: string, brand?: string | null, everywhere = false) =>
    fetch('/api/image-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, brand, scope: everywhere ? 'all' : 'preferred' }),
    })
      .then(r => json<ImageSearchResult | ImageSearchHit[]>(r))
      // the legacy PC version answers with a plain list
      .then((r): ImageSearchResult => (Array.isArray(r) ? { hits: r, scope: 'all' } : r)),
  saveImageFromUrl: (url: string, fallbackUrl?: string | null) =>
    fetch('/api/images/from-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, fallbackUrl }) })
      .then(r => json<{ path: string }>(r)).then(r => r.path),
  async uploadImage(file: Blob, name = 'photo.jpg'): Promise<string> {
    const fd = new FormData()
    fd.append('file', file, name)
    const res = await json<{ path: string }>(await fetch('/api/images', { method: 'POST', body: fd }))
    return res.path
  },
}

/** Phone photos are often 5–10MB; shrink to within 1600px before uploading */
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Image compression failed'))), 'image/jpeg', 0.88))
  } catch {
    return file
  }
}
