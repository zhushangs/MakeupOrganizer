import { useMemo, useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor } from '../color'
import ColorSection, { resizeSwatches } from '../components/ColorSection'
import DuplicateSheet from '../components/DuplicateSheet'
import PaletteLayout from '../components/PaletteLayout'
import { findDuplicate } from '../dup'
import { categoryOf, getCategories, newCategoryKey, type AppSettings, type Product, type ProductInput } from '../types'
import { go } from '../App'

const CHANNELS = ['Sephora', 'Ulta', 'Nordstrom', "Macy's", "Bloomingdale's", 'Saks Fifth Avenue', 'Neiman Marcus', 'Amazon', 'Target', 'Brand website', 'Counter', 'Duty free', 'Gift']

function blank(category: string): ProductInput {
  const c = categoryOf(category)
  return {
    category: c.key, brand: '', name: '', shadeName: '', imagePath: null,
    channel: '', originalPrice: null, paidPrice: null, currency: 'USD',
    gridRows: c.defaultRows, gridCols: c.defaultCols,
    swatches: Array.from({ length: c.defaultRows * c.defaultCols }, () => ({})),
    notes: '',
  }
}

const parsePrice = (v: string) => {
  if (v.trim() === '') return null
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

export default function EditPage({ items, brands, settings, onSaveSettings, existing, initialCategory, onSaved }: {
  items: Product[] | null
  brands: string[]
  settings: AppSettings
  onSaveSettings: (s: AppSettings) => Promise<void>
  existing?: Product
  initialCategory?: string
  onSaved: (p: Product, isNew: boolean) => void
}) {
  const [f, setF] = useState<ProductInput>(() => existing ? structuredClone(existing) : blank(initialCategory ?? getCategories()[0]?.key ?? 'other'))
  // keep the raw text so typing "12." isn't eaten by number parsing
  const [orig, setOrig] = useState(existing?.originalPrice?.toString() ?? '')
  const [paid, setPaid] = useState(existing?.paidPrice?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dupPrompt, setDupPrompt] = useState<Product | null>(null)
  const dup = useMemo(() => findDuplicate(items, f, existing?.id), [items, f.brand, f.name, f.shadeName, existing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // inline "+ New category"
  const [newCat, setNewCat] = useState<{ label: string; multi: boolean } | null>(null)
  const addCategory = async () => {
    const label = newCat?.label.trim()
    if (!label) return
    const existingCat = getCategories().find(c => c.label.toLowerCase() === label.toLowerCase())
    if (existingCat) { setCategory(existingCat.key); setNewCat(null); return }
    const key = newCategoryKey(label, getCategories().map(c => c.key))
    const multi = newCat!.multi
    try {
      await onSaveSettings({
        ...settings,
        // new categories go before "Other", which stays last
        categories: [
          ...getCategories().filter(c => c.key !== 'other'),
          { key, label, multi, defaultRows: multi ? 2 : 1, defaultCols: multi ? 2 : 1 },
          ...getCategories().filter(c => c.key === 'other'),
        ],
      })
      setCategory(key)
      setNewCat(null)
    } catch (e) { setError((e as Error).message) }
  }

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF(prev => ({ ...prev, [k]: v }))

  const setCategory = (key: string) => {
    const c = categoryOf(key)
    setF(prev => {
      let { gridRows, gridCols, swatches } = prev
      if (c.multi && gridRows * gridCols === 1) {
        gridRows = c.defaultRows; gridCols = c.defaultCols
        swatches = resizeSwatches(swatches, prev.gridCols, gridRows, gridCols)
      } else if (!c.multi && gridRows * gridCols > 1 && swatches.filter(s => s.hex).length <= 1) {
        gridRows = 1; gridCols = 1
        swatches = [swatches.find(s => s.hex) ?? {}]
      }
      return { ...prev, category: c.key, gridRows, gridCols, swatches }
    })
  }

  const onFile = async (file?: File) => {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const path = await api.uploadImage(await shrinkImage(file), file.name.replace(/\.\w+$/, '') + '.jpg')
      const single = f.gridRows * f.gridCols === 1
      const color = single ? await dominantColor(path).catch(() => null) : null
      setF(prev => ({ ...prev, imagePath: path, swatches: color ? [{ ...prev.swatches[0], hex: color }] : prev.swatches }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async (allowDuplicate = false) => {
    if (!f.brand.trim() && !f.name.trim()) { setError('Please enter at least a brand or a product name'); return }
    if (dup && !allowDuplicate) { setDupPrompt(dup); return }
    setDupPrompt(null)
    setSaving(true); setError(null)
    try {
      const body: ProductInput = { ...f, originalPrice: parsePrice(orig), paidPrice: parsePrice(paid) }
      const saved = existing ? await api.update(existing.id, body) : await api.create(body)
      onSaved(saved, !existing)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go('/'))}>‹ Back</button>
        <h2>{existing ? 'Edit' : 'Add item'}</h2>
        <span style={{ width: 52 }} />
      </div>

      <div className="form">
        <div className="card">
          <h3>Category</h3>
          <div className="chips" style={{ flexWrap: 'wrap', padding: 0 }}>
            {getCategories().map(c => (
              <button key={c.key} type="button" className={'chip' + (c.key === f.category ? ' on' : '')} onClick={() => setCategory(c.key)}>
                {c.label}
              </button>
            ))}
            {!newCat && <button type="button" className="chip add" onClick={() => setNewCat({ label: '', multi: false })}>+ New</button>}
          </div>
          {newCat && (
            <div className="new-cat">
              <input className="input" autoFocus placeholder="e.g. Mascara" value={newCat.label}
                onChange={e => setNewCat({ ...newCat, label: e.target.value })} onKeyDown={e => e.key === 'Enter' && addCategory()} />
              <label className="check small">
                <input type="checkbox" checked={newCat.multi} onChange={e => setNewCat({ ...newCat, multi: e.target.checked })} />
                Has several pans (palette)
              </label>
              <div className="row">
                <button type="button" className="btn small" onClick={() => setNewCat(null)}>Cancel</button>
                <button type="button" className="btn small primary" onClick={addCategory} disabled={!newCat.label.trim()}>Add category</button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Product</h3>
          <div className="field"><label>Brand</label>
            <input className="input" list="brand-list" value={f.brand} onChange={e => set('brand', e.target.value)} placeholder="MAC" autoCapitalize="words" />
            <datalist id="brand-list">{brands.map(b => <option key={b} value={b} />)}</datalist></div>
          <div className="field"><label>Product name</label>
            <input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Matte Lipstick" autoCapitalize="words" /></div>
          <div className="field"><label>{f.gridRows * f.gridCols > 1 ? 'Palette / shade name' : 'Shade'}</label>
            <input className="input" value={f.shadeName ?? ''} onChange={e => set('shadeName', e.target.value)} placeholder="Ruby Woo" autoCapitalize="words" /></div>
          {dup && (
            <div className="warn dup-hint">
              You already have <b>{[dup.brand, dup.shadeName || dup.name].filter(Boolean).join(' · ')}</b>.{' '}
              <button type="button" className="link-btn" onClick={() => go(`/?open=${dup.id}`)}>View it</button>
            </div>
          )}
        </div>

        {!existing && (categoryOf(f.category).multi || f.gridRows * f.gridCols > 1) && (
          <div className="card">
            <h3>Palette layout<span className="opt">match the real pans</span></h3>
            <PaletteLayout rows={f.gridRows} cols={f.gridCols}
              onChange={(r, c) => setF(prev => ({ ...prev, gridRows: r, gridCols: c, swatches: resizeSwatches(prev.swatches, prev.gridCols, r, c) }))} />
          </div>
        )}

        <div className="card">
          <h3>Purchase<span className="opt">optional</span></h3>
          <div className="field"><label>Bought at</label>
            <input className="input" list="channels" value={f.channel ?? ''} onChange={e => set('channel', e.target.value)} placeholder="Sephora" />
            <datalist id="channels">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist></div>
          <div className="row">
            <div className="field"><label>Original price</label>
              <input className="input" inputMode="decimal" value={orig} placeholder="0.00" onChange={e => setOrig(e.target.value)} /></div>
            <div className="field"><label>Price paid</label>
              <input className="input" inputMode="decimal" value={paid} placeholder="0.00" onChange={e => setPaid(e.target.value)} /></div>
            <div className="field" style={{ flex: '0 0 86px' }}><label>Currency</label>
              <select className="input" value={f.currency ?? 'USD'} onChange={e => set('currency', e.target.value)}>
                <option>USD</option><option>CNY</option><option>EUR</option><option>JPY</option><option>KRW</option><option>GBP</option><option>CAD</option>
              </select></div>
          </div>
        </div>

        <div className="card">
          <h3>Notes<span className="opt">how it wears, what you think</span></h3>
          <textarea className="input" rows={5} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)}
            placeholder="Long-lasting, slightly drying. Great with a gloss on top…" />
        </div>

        {existing && (
          <>
            <div className="card">
              <h3>Picture</h3>
              <div className="img-box">
                {f.imagePath
                  ? <img className="img-preview" src={f.imagePath} alt="" />
                  : <div className="img-placeholder">No picture</div>}
                <div className="img-actions">
                  <button type="button" className="btn small" onClick={() => go(`/image/${existing.id}`)}>Search online</button>
                  <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <span className="spinner" /> : 'Upload photo'}
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
              </div>
            </div>

            <div className="card">
              <h3>Color card</h3>
              <ColorSection value={f} imagePath={f.imagePath} showLayout={categoryOf(f.category).multi} onChange={v => setF(prev => ({ ...prev, ...v }))} />
            </div>
          </>
        )}

        {error && <div className="err">{error}</div>}
      </div>

      {dupPrompt && (
        <DuplicateSheet existing={dupPrompt} onClose={() => setDupPrompt(null)}
          onView={() => go(`/?open=${dupPrompt.id}`)} onAddAnyway={() => save(true)} />
      )}

      <div className="save-bar">
        <button className="btn primary" onClick={() => save()} disabled={saving}>
          {saving ? <span className="spinner" /> : existing ? 'Save changes' : 'Save & find a picture'}
        </button>
      </div>
    </div>
  )
}
