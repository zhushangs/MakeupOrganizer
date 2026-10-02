import { useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor, isDark, swatchColor } from '../color'
import ColorEditor from '../components/ColorEditor'
import { CATEGORIES, categoryOf, type Product, type ProductInput, type Swatch } from '../types'
import { go } from '../App'

const CHANNELS = ['Sephora', 'Ulta', 'Nordstrom', "Macy's", "Bloomingdale's", 'Saks Fifth Avenue', 'Neiman Marcus', 'Brand website', 'Counter', 'Duty free', 'Gift']

function guessCategory(text: string): string | null {
  const t = text.toLowerCase()
  if (/palette|eye ?shadow|eyeshadow|眼影/.test(t)) return 'eyeshadow'
  if (/gloss|lip oil|lip stain|liquid lip|lacquer|lip tint|唇釉|唇彩|唇蜜/.test(t)) return 'lipgloss'
  if (/lipstick|lip colou?r|rouge|lip balm|口红|唇膏/.test(t)) return 'lipstick'
  if (/blush|腮红/.test(t)) return 'blush'
  if (/highlight|bronzer|contour|高光|修容/.test(t)) return 'highlight'
  if (/foundation|concealer|powder|primer|cushion|tint|粉底|遮瑕|气垫|散粉/.test(t)) return 'base'
  return null
}

function resize(sw: Swatch[], oldCols: number, rows: number, cols: number): Swatch[] {
  const out: Swatch[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push(c < oldCols ? (sw[r * oldCols + c] ?? {}) : {})
  return out
}

function blank(category: string): ProductInput {
  const c = categoryOf(category)
  return {
    category: c.key, brand: '', name: '', shadeName: '', imagePath: null, swatchImagePath: null,
    sourceUrl: '', channel: '', price: null, currency: 'USD',
    gridRows: c.defaultRows, gridCols: c.defaultCols,
    swatches: Array.from({ length: c.defaultRows * c.defaultCols }, () => ({})),
    notes: '',
  }
}

export default function EditPage({ existing, initialMode, initialCategory, onSaved }: {
  existing?: Product
  initialMode: 'link' | 'manual'
  initialCategory?: string
  onSaved: (p: Product) => void
}) {
  const [f, setF] = useState<ProductInput>(() => existing ? structuredClone(existing) : blank(initialCategory ?? 'lipstick'))
  const [sel, setSel] = useState(0)
  const [link, setLink] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scraped, setScraped] = useState(!!existing || initialMode === 'manual')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF(prev => ({ ...prev, [k]: v }))
  const multi = f.gridRows * f.gridCols > 1
  const cells = f.gridRows * f.gridCols

  const setColor = (i: number, hex: string) =>
    setF(prev => ({ ...prev, swatches: prev.swatches.map((s, j) => (j === i ? { ...s, hex } : s)) }))

  const setLabel = (i: number, label: string) =>
    setF(prev => ({ ...prev, swatches: prev.swatches.map((s, j) => (j === i ? { ...s, label } : s)) }))

  const setGrid = (rows: number, cols: number) => {
    rows = Math.max(1, Math.min(10, rows)); cols = Math.max(1, Math.min(10, cols))
    setF(prev => ({ ...prev, gridRows: rows, gridCols: cols, swatches: resize(prev.swatches, prev.gridCols, rows, cols) }))
    setSel(s => Math.min(s, rows * cols - 1))
  }

  const setCategory = (key: string) => {
    const c = categoryOf(key)
    setF(prev => {
      let { gridRows, gridCols, swatches } = prev
      if (c.multi && gridRows * gridCols === 1) {
        gridRows = c.defaultRows; gridCols = c.defaultCols
        swatches = resize(swatches, prev.gridCols, gridRows, gridCols)
      } else if (!c.multi && gridRows * gridCols > 1 && swatches.filter(s => s.hex).length <= 1) {
        gridRows = 1; gridCols = 1
        swatches = [swatches.find(s => s.hex) ?? {}]
      }
      return { ...prev, category: c.key, gridRows, gridCols, swatches }
    })
    setSel(0)
  }

  /** 自动取色：页面给的色值 > 色块小图 > 商品图主色 */
  const autoColor = async (r: { colorHex?: string | null; swatchImagePath?: string | null; imagePath?: string | null }) => {
    try {
      if (r.colorHex) return r.colorHex
      if (r.swatchImagePath) { const c = await swatchColor(r.swatchImagePath); if (c) return c }
      if (r.imagePath) return await dominantColor(r.imagePath)
    } catch { /* ignore */ }
    return null
  }

  const doScrape = async () => {
    if (!link.trim()) return
    setScraping(true); setError(null); setWarnings([])
    try {
      const r = await api.scrape(link)
      const text = [r.name, r.shadeName].filter(Boolean).join(' ')
      const guessed = guessCategory(text)
      const cat = categoryOf(guessed ?? f.category)
      const rows = cat.multi ? cat.defaultRows : 1, cols = cat.multi ? cat.defaultCols : 1
      const swatches: Swatch[] = Array.from({ length: rows * cols }, () => ({}))
      if (!cat.multi) {
        const c = await autoColor(r)
        if (c) swatches[0] = { hex: c }
      }
      setF(prev => ({
        ...prev,
        category: cat.key,
        brand: r.brand ?? prev.brand,
        name: r.name ?? prev.name,
        shadeName: r.shadeName ?? prev.shadeName,
        imagePath: r.imagePath ?? prev.imagePath,
        swatchImagePath: r.swatchImagePath ?? null,
        sourceUrl: r.sourceUrl || link,
        channel: r.channel ?? prev.channel,
        price: r.price ?? prev.price,
        currency: r.currency ?? prev.currency ?? 'USD',
        gridRows: rows, gridCols: cols, swatches,
      }))
      setSel(0)
      setWarnings(r.warnings)
      setScraped(true)
    } catch (e) {
      setError((e as Error).message)
      setScraped(true)
    } finally {
      setScraping(false)
    }
  }

  const onFile = async (file?: File) => {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const path = await api.uploadImage(await shrinkImage(file), file.name.replace(/\.\w+$/, '') + '.jpg')
      set('imagePath', path)
      if (!multi && !f.swatches[0]?.hex) {
        const c = await dominantColor(path).catch(() => null)
        if (c) setColor(0, c)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const resetColorFromImage = async () => {
    const c = await autoColor({ swatchImagePath: f.swatchImagePath, imagePath: f.imagePath })
    if (c) setColor(0, c)
  }

  const save = async () => {
    if (!f.brand.trim() && !f.name.trim()) { setError('Please enter at least a brand or a name'); return }
    setSaving(true); setError(null)
    try {
      const body: ProductInput = { ...f, price: f.price == null || Number.isNaN(f.price) ? null : f.price }
      const saved = existing ? await api.update(existing.id, body) : await api.create(body)
      onSaved(saved)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const images = [
    ...(f.imagePath ? [{ label: 'Product', src: f.imagePath }] : []),
    ...(f.swatchImagePath ? [{ label: 'Swatch', src: f.swatchImagePath }] : []),
  ]

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go('/'))}>‹ Back</button>
        <h2>{existing ? 'Edit' : 'Add'}</h2>
        <span style={{ width: 52 }} />
      </div>

      <div className="form">
        {!existing && initialMode === 'link' && (
          <div className="card">
            <h3>Product link</h3>
            <div className="link-row">
              <input className="input" type="url" inputMode="url" placeholder="Paste a Sephora / Ulta / brand site link"
                value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => e.key === 'Enter' && doScrape()} />
              <button className="btn primary" onClick={doScrape} disabled={scraping || !link.trim()}>
                {scraping ? <span className="spinner" /> : 'Fetch'}
              </button>
            </div>
            {warnings.length > 0 && <div className="warn">{warnings.map(w => <div key={w}>{w}</div>)}</div>}
            {!scraped && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setScraped(true)}>Skip and fill in manually →</button>}
          </div>
        )}

        {scraped && (
          <>
            <div className="card">
              <h3>Category</h3>
              <div className="chips" style={{ flexWrap: 'wrap', padding: 0 }}>
                {CATEGORIES.map(c => (
                  <button key={c.key} type="button" className={'chip' + (c.key === f.category ? ' on' : '')} onClick={() => setCategory(c.key)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Details</h3>
              <div className="img-box">
                {f.imagePath
                  ? <img className="img-preview" src={f.imagePath} alt="" />
                  : <div className="img-placeholder">No image</div>}
                <div className="img-actions">
                  <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <span className="spinner" /> : f.imagePath ? 'Change image' : 'Take / upload photo'}
                  </button>
                  {f.imagePath && <button type="button" className="link-btn" onClick={() => set('imagePath', null)}>Remove image</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
              </div>
              <div className="field"><label>Brand</label>
                <input className="input" value={f.brand} onChange={e => set('brand', e.target.value)} placeholder="MAC" /></div>
              <div className="field"><label>Name</label>
                <input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Matte Lipstick" /></div>
              <div className="field"><label>{multi ? 'Palette / shade name' : 'Shade'}</label>
                <input className="input" value={f.shadeName ?? ''} onChange={e => set('shadeName', e.target.value)} placeholder="Ruby Woo" /></div>
            </div>

            <div className="card">
              <h3>Color</h3>
              <div className="grid-size">
                <span>Grid</span>
                <Stepper value={f.gridRows} onChange={v => setGrid(v, f.gridCols)} />
                <span>rows ×</span>
                <Stepper value={f.gridCols} onChange={v => setGrid(f.gridRows, v)} />
                <span>cols = {cells} {cells === 1 ? 'pan' : 'pans'}</span>
              </div>

              {multi && (
                <div className="edit-grid" style={{ gridTemplateColumns: `repeat(${f.gridCols}, 1fr)` }}>
                  {f.swatches.map((s, i) => (
                    <button key={i} type="button" className={'edit-cell' + (i === sel ? ' sel' : '')}
                      style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}
                      onClick={() => setSel(i)}>
                      <span className="i">{i + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              {multi && (
                <div className="field"><label>Pan {sel + 1} name (optional)</label>
                  <input className="input" value={f.swatches[sel]?.label ?? ''} onChange={e => setLabel(sel, e.target.value)} placeholder="e.g. Buzz" /></div>
              )}

              <ColorEditor
                value={f.swatches[sel]?.hex}
                images={images}
                hint={multi ? `Tap pan ${sel + 1} on the image. It moves to the next pan automatically.` : 'Press and drag on the image, release to pick'}
                onChange={(hex, fromImage) => {
                  setColor(sel, hex)
                  if (fromImage && multi) setSel(s => Math.min(s + 1, cells - 1))
                }}
              />
              {!multi && images.length > 0 && (
                <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={resetColorFromImage}>
                  Reset to auto-detected color
                </button>
              )}
            </div>

            <div className="card">
              <h3>Purchase info<span className="opt">optional</span></h3>
              <div className="row">
                <div className="field"><label>Price</label>
                  <input className="input" inputMode="decimal" value={f.price ?? ''} placeholder="0.00"
                    onChange={e => set('price', e.target.value === '' ? null : parseFloat(e.target.value))} /></div>
                <div className="field" style={{ flex: '0 0 96px' }}><label>Currency</label>
                  <select className="input" value={f.currency ?? 'USD'} onChange={e => set('currency', e.target.value)}>
                    <option>USD</option><option>CNY</option><option>EUR</option><option>JPY</option><option>KRW</option><option>GBP</option>
                  </select></div>
              </div>
              <div className="field"><label>Bought at</label>
                <input className="input" list="channels" value={f.channel ?? ''} onChange={e => set('channel', e.target.value)} placeholder="Sephora" />
                <datalist id="channels">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist></div>
              <div className="field"><label>Product link</label>
                <input className="input" type="url" value={f.sourceUrl ?? ''} onChange={e => set('sourceUrl', e.target.value)} placeholder="https://" /></div>
              <div className="field"><label>Notes</label>
                <textarea className="input" rows={2} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} /></div>
            </div>

            {error && <div className="err">{error}</div>}
          </>
        )}
        {!scraped && error && <div className="err">{error}</div>}
      </div>

      {scraped && (
        <div className="save-bar">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : existing ? 'Save changes' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 10} aria-label="Increase">+</button>
    </span>
  )
}
