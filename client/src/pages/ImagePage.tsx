import { useEffect, useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor, loadImage } from '../color'
import ColorSection from '../components/ColorSection'
import { isMulti } from '../layout'
import SwatchCard from '../components/SwatchCard'
import { categoryOf, type ImageSearchHit, type ImageSearchResult, type Product } from '../types'
import { go } from '../App'

const defaultQuery = (p: Product) => [p.brand, p.name, p.shadeName].filter(Boolean).join(' ')

/**
 * Search results are kept for the browser session, so reopening this page, coming back to it, or the
 * home-screen app reloading itself (iPhone does that after a while in the background) shows the earlier
 * results instead of spending another Serper credit on the same search.
 */
const CACHE_PREFIX = 'image-search2:'
const cacheKey = (q: string, brand: string) =>
  CACHE_PREFIX + brand.trim().toLowerCase() + '|' + q.trim().toLowerCase().replace(/\s+/g, ' ')
function cachedResult(q: string, brand: string): ImageSearchResult | null {
  try {
    const v = sessionStorage.getItem(cacheKey(q, brand))
    const r = v ? JSON.parse(v) : null
    return r && Array.isArray(r.hits) ? (r as ImageSearchResult) : null
  } catch { return null }
}
function rememberResult(q: string, brand: string, r: ImageSearchResult) {
  try { sessionStorage.setItem(cacheKey(q, brand), JSON.stringify(r)) } catch { /* storage full or blocked */ }
}

/** Best sources first (brand site, Sephora/Ulta, department stores, Temptalia, others), no duplicates */
function mergeHits(first: ImageSearchHit[], more: ImageSearchHit[]) {
  const seen = new Set(first.map(h => h.imageUrl))
  return [...first, ...more.filter(h => !seen.has(h.imageUrl))].sort((a, b) => (a.rank ?? 4) - (b.rank ?? 4))
}

/**
 * Step after saving an item: search the web for a picture, pick one,
 * then confirm/adjust the color card that's auto-generated from it.
 */
export default function ImagePage({ product, isNew, onDone }: {
  product: Product
  isNew: boolean
  onDone: (p: Product) => void
}) {
  const [draft, setDraft] = useState<Product>(product)
  const [stage, setStage] = useState<'search' | 'color'>('search')
  const [query, setQuery] = useState(() => defaultQuery(product))
  const [hits, setHits] = useState<ImageSearchHit[] | null>(null)
  const [scope, setScope] = useState<ImageSearchResult['scope'] | null>(null)
  /** the query the shown results are for (the box may have been edited since) */
  const [shownQuery, setShownQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // a ref, not state: blocks a second request even within the same render (double Enter, Enter + tap)
  const inFlight = useRef(false)
  const autoSearched = useRef(false)

  const show = (q: string, r: ImageSearchResult) => { setHits(r.hits); setScope(r.scope); setShownQuery(q); setError(null) }

  /** First the preferred sites; the server widens to everywhere by itself when they find almost nothing */
  const search = async (q = query) => {
    if (!q.trim() || inFlight.current) return
    const cached = cachedResult(q, product.brand)
    if (cached) { show(q, cached); return }
    inFlight.current = true
    setSearching(true); setError(null)
    try {
      const r = await api.searchImages(q, product.brand)
      show(q, r)
      rememberResult(q, product.brand, r)
    }
    catch (e) { setError((e as Error).message); setHits(null); setScope(null) }
    finally { inFlight.current = false; setSearching(false) }
  }

  /** The preferred sites had results, but none fit: add results from everywhere */
  const searchEverywhere = async () => {
    const q = shownQuery
    if (!q || !hits || inFlight.current) return
    inFlight.current = true
    setSearching(true); setError(null)
    try {
      const r = await api.searchImages(q, product.brand, true)
      const merged: ImageSearchResult = { hits: mergeHits(hits, r.hits), scope: 'expanded' }
      show(q, merged)
      rememberResult(q, product.brand, merged)
    }
    catch (e) { setError((e as Error).message) }
    finally { inFlight.current = false; setSearching(false) }
  }

  useEffect(() => {
    // React StrictMode runs effects twice in development; only run once
    if (autoSearched.current) return
    autoSearched.current = true
    // No automatic search: the user may already have a photo to upload, and a search costs a Serper
    // credit. Results already searched this session are free, so show those straight away.
    const cached = query.trim() ? cachedResult(query, product.brand) : null
    if (cached) show(query, cached)
    api.searchStatus().then(s => setConfigured(s.configured)).catch(() => setConfigured(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Use a picture: auto-detect the color for single-color items, then go to the color step */
  const usePicture = async (path: string) => {
    // Make sure the browser can actually display it before moving on
    try { await loadImage(path) }
    catch { throw new Error("This picture can't be displayed. Please choose a different one.") }
    const single = !isMulti(draft)
    const color = single ? await dominantColor(path).catch(() => null) : null
    setDraft(d => ({ ...d, imagePath: path, swatches: color ? [{ ...d.swatches[0], hex: color }] : d.swatches }))
    setStage('color')
    window.scrollTo(0, 0)
  }

  const pick = async (h: ImageSearchHit) => {
    setPicking(h.imageUrl); setError(null)
    try { await usePicture(await api.saveImageFromUrl(h.imageUrl, h.thumbnailUrl)) }
    catch (e) { setError((e as Error).message) }
    finally { setPicking(null) }
  }

  const onFile = async (file?: File) => {
    if (!file) return
    setPicking('upload'); setError(null)
    try { await usePicture(await api.uploadImage(await shrinkImage(file), 'photo.jpg')) }
    catch (e) { setError((e as Error).message) }
    finally { setPicking(null); if (fileRef.current) fileRef.current.value = '' }
  }

  const save = async () => {
    setSaving(true); setError(null)
    try { onDone(await api.update(product.id, draft)) }
    catch (e) { setError((e as Error).message); setSaving(false) }
  }

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => stage === 'color' ? setStage('search') : history.length > 1 ? history.back() : go('/')}>‹ Back</button>
        <h2>{stage === 'search' ? 'Find a picture' : 'Color card'}</h2>
        {isNew && stage === 'search'
          ? <button className="link-btn" onClick={() => go(`/?c=${product.category}`)}>Skip</button>
          : <span style={{ width: 40 }} />}
      </div>

      {stage === 'search' && (
        <div className="form">
          <div className="card">
            <button type="button" className="btn upload-first" disabled={!!picking}
              onClick={() => fileRef.current?.click()}>
              {picking === 'upload' ? <span className="spinner" /> : <>📷 Upload my own photo</>}
            </button>
            <div className="or-line"><span>or search online</span></div>
            <div className="link-row">
              <input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && search()} placeholder="Brand, product, shade" />
              <button className="btn primary" onClick={() => search()} disabled={searching || !configured || !query.trim()}>
                {searching ? <span className="spinner" /> : 'Search'}
              </button>
            </div>
            {configured === false && (
              <div className="warn">
                Online image search isn't set up yet (no Serper API key). In the worker folder run
                <code> npx wrangler secret put SERPER_API_KEY</code> (see README). You can still upload a photo above.
              </div>
            )}
            {error && <div className="err">{error}</div>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
          </div>

          {hits && hits.length === 0 && <div className="empty">No pictures found. Try fewer words.</div>}
          {hits && hits.length > 0 && (
            <>
              <div className="search-scope">
                <span>
                  {scope === 'preferred' && <>From the brand's site, Sephora, Ulta, department stores and Temptalia.</>}
                  {scope === 'expanded' && <>Few results on the preferred sites, so this also searched everywhere.</>}
                  {scope === 'all' && <>Searched everywhere.</>}
                  {' '}Tap the picture that matches your shade.
                </span>
                {scope === 'preferred' && (
                  <button type="button" className="link-btn small" onClick={searchEverywhere} disabled={searching || !!picking}>
                    {searching ? <span className="spinner" /> : 'Not here? Search everywhere'}
                  </button>
                )}
              </div>
              <div className="results">
                {hits.map(h => (
                  <button key={h.imageUrl} className="result" onClick={() => pick(h)} disabled={!!picking} title={h.title ?? ''}>
                    <img src={h.thumbnailUrl || h.imageUrl} alt={h.title ?? ''} loading="lazy" referrerPolicy="no-referrer" />
                    {picking === h.imageUrl && <span className="result-busy"><span className="spinner" /></span>}
                    {(h.label || h.source) && (
                      <span className={'result-src' + (h.rank === 0 ? ' official' : h.label ? ' known' : '')}>{h.label ?? h.source}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {stage === 'color' && (
        <div className="form">
          <SwatchCard p={draft} />
          <div className="card">
            <h3>Adjust the color<span className="opt">if it looks off</span></h3>
            <ColorSection value={draft} imagePath={draft.imagePath} showLayout={categoryOf(draft.category).multi} onChange={v => setDraft(d => ({ ...d, ...v }))} />
          </div>
          <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setStage('search')}>‹ Choose a different picture</button>
          {error && <div className="err">{error}</div>}
        </div>
      )}

      {stage === 'color' && (
        <div className="save-bar">
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : 'Save'}</button>
        </div>
      )}
    </div>
  )
}
