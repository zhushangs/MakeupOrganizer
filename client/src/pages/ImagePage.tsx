import { useEffect, useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor, loadImage } from '../color'
import ColorSection from '../components/ColorSection'
import { isMulti } from '../layout'
import SwatchCard from '../components/SwatchCard'
import { categoryOf, type ImageSearchHit, type Product } from '../types'
import { go } from '../App'

const defaultQuery = (p: Product) => [p.brand, p.name, p.shadeName].filter(Boolean).join(' ')

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
  const [searching, setSearching] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const search = async (q = query) => {
    if (!q.trim()) return
    setSearching(true); setError(null)
    try { setHits(await api.searchImages(q)) }
    catch (e) { setError((e as Error).message); setHits(null) }
    finally { setSearching(false) }
  }

  useEffect(() => {
    api.searchStatus().then(s => {
      setConfigured(s.configured)
      if (s.configured && query.trim()) search(query)
    }).catch(() => setConfigured(false))
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
            <div className="link-row">
              <input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()} placeholder="Brand, product, shade" />
              <button className="btn primary" onClick={() => search()} disabled={searching || !configured || !query.trim()}>
                {searching ? <span className="spinner" /> : 'Search'}
              </button>
            </div>
            {configured === false && (
              <div className="warn">
                Online image search isn't set up yet. Put your Serper API key in
                <code> appsettings.Local.json</code> (see README) and restart. You can still upload a photo below.
              </div>
            )}
            {error && <div className="err">{error}</div>}
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} disabled={!!picking}
              onClick={() => fileRef.current?.click()}>Upload my own photo instead</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
          </div>

          {hits && hits.length === 0 && <div className="empty">No pictures found. Try fewer words.</div>}
          {hits && hits.length > 0 && (
            <>
              <div className="hint" style={{ padding: '0 4px' }}>Tap the picture that matches your shade</div>
              <div className="results">
                {hits.map(h => (
                  <button key={h.imageUrl} className="result" onClick={() => pick(h)} disabled={!!picking} title={h.title ?? ''}>
                    <img src={h.thumbnailUrl || h.imageUrl} alt={h.title ?? ''} loading="lazy" referrerPolicy="no-referrer" />
                    {picking === h.imageUrl && <span className="result-busy"><span className="spinner" /></span>}
                    {h.source && <span className="result-src">{h.source}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
          {picking === 'upload' && <div className="empty"><span className="spinner" /></div>}
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
