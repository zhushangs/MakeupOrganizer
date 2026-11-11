import { useMemo, useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor } from '../color'
import ColorSection from '../components/ColorSection'
import { isMulti, isSplitProduct, reshapeSwatches, type Shape } from '../layout'
import DuplicateSheet from '../components/DuplicateSheet'
import PaletteLayout from '../components/PaletteLayout'
import { findDuplicate } from '../dup'
import { GROUPS, categoriesIn, categoryOf, getCategories, groupOf, newCategoryKey, type AppSettings, type Group, type Product, type ProductInput } from '../types'
import { go } from '../App'
import { BATCH_LOOKUP_URL, DISCOUNTS, PAO_CHOICES, todayIso } from '../dates'

const CHANNELS = ['Sephora', 'Ulta', 'Nordstrom', "Macy's", "Bloomingdale's", 'Saks Fifth Avenue', 'Neiman Marcus', 'Amazon', 'Target', 'Brand website', 'Counter', 'Duty free', 'Gift']

function blank(category: string): ProductInput {
  const c = categoryOf(category)
  return {
    category: c.key, brand: '', name: '', shadeName: '', imagePath: null,
    channel: '', originalPrice: null, paidPrice: null, currency: 'USD',
    gridRows: c.defaultRows, gridCols: c.defaultCols,
    swatches: Array.from({ length: c.defaultRows * c.defaultCols }, () => ({})),
    // most skincare has no color: those categories start without a color card
    noColor: !!c.noColor,
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
  // "20% off" chips: fill in the price paid from the original (or the original from what was paid)
  const [discount, setDiscount] = useState<number | null>(null)
  const [customOff, setCustomOff] = useState('')
  const money = (n: number) => String(Math.round(n * 100) / 100)
  const applyDiscount = (off: number | null) => {
    setDiscount(off)
    if (off == null || off <= 0 || off >= 100) return
    const o = parsePrice(orig), pd = parsePrice(paid)
    if (o != null) setPaid(money(o * (1 - off / 100)))
    else if (pd != null) setOrig(money(pd / (1 - off / 100)))
  }
  // which half (makeup / skincare) the category chips show
  const [catGroup, setCatGroup] = useState<Group>(() => groupOf(categoryOf(f.category)))
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
          { key, label, multi, defaultRows: multi ? 2 : 1, defaultCols: multi ? 2 : 1, group: catGroup, noColor: catGroup === 'skincare' || undefined },
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
      let shape: Shape = prev
      let swatches = prev.swatches
      if (c.multi && !isMulti(prev)) {
        shape = { gridRows: c.defaultRows, gridCols: c.defaultCols, layout: null }
        swatches = reshapeSwatches(prev, prev.swatches, shape)
      } else if (!c.multi && isMulti(prev) && swatches.filter(s => s.hex).length <= 1) {
        shape = { gridRows: 1, gridCols: 1, layout: null }
        swatches = [swatches.find(s => s.hex) ?? {}]
      }
      // a new item takes the category's color-card default (skincare usually has none)
      const noColor = existing ? prev.noColor : !!c.noColor
      return { ...prev, category: c.key, gridRows: shape.gridRows, gridCols: shape.gridCols, layout: shape.layout ?? null, swatches, noColor }
    })
  }

  const onFile = async (file?: File) => {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const path = await api.uploadImage(await shrinkImage(file), file.name.replace(/\.\w+$/, '') + '.jpg')
      const single = !isMulti(f)
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
          <div className="seg group-seg in-form">
            {GROUPS.map(g => (
              <button key={g.key} type="button" className={g.key === catGroup ? 'on' : ''} onClick={() => setCatGroup(g.key)}>{g.label}</button>
            ))}
          </div>
          <div className="chips" style={{ flexWrap: 'wrap', padding: 0 }}>
            {categoriesIn(catGroup).map(c => (
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
          <div className="field"><label>{isMulti(f) && !isSplitProduct(f) ? 'Palette / shade name' : 'Shade'}</label>
            <input className="input" value={f.shadeName ?? ''} onChange={e => set('shadeName', e.target.value)} placeholder="Ruby Woo" autoCapitalize="words" /></div>
          {dup && (
            <div className="warn dup-hint">
              You already have <b>{[dup.brand, dup.shadeName || dup.name].filter(Boolean).join(' · ')}</b>.{' '}
              <button type="button" className="link-btn" onClick={() => go(`/?open=${dup.id}`)}>View it</button>
            </div>
          )}
        </div>

        {!existing && (categoryOf(f.category).multi || isMulti(f)) && (
          <div className="card">
            <h3>Palette layout<span className="opt">match the real pans</span></h3>
            <PaletteLayout value={f}
              onChange={shape => setF(prev => ({ ...prev, ...shape, layout: shape.layout ?? null, swatches: reshapeSwatches(prev, prev.swatches, shape) }))} />
          </div>
        )}

        <div className="card">
          <h3>Purchase<span className="opt">optional</span></h3>
          <div className="field"><label>Bought at</label>
            <input className="input" list="channels" value={f.channel ?? ''} onChange={e => set('channel', e.target.value)} placeholder="Sephora" />
            <datalist id="channels">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist></div>
          <div className="row">
            <div className="field"><label>Original price</label>
              <input className="input" inputMode="decimal" value={orig} placeholder="0.00"
                onChange={e => { setOrig(e.target.value); setDiscount(null) }} /></div>
            <div className="field"><label>Price paid</label>
              <input className="input" inputMode="decimal" value={paid} placeholder="0.00"
                onChange={e => { setPaid(e.target.value); setDiscount(null) }} /></div>
            <div className="field" style={{ flex: '0 0 86px' }}><label>Currency</label>
              <select className="input" value={f.currency ?? 'USD'} onChange={e => set('currency', e.target.value)}>
                <option>USD</option><option>CNY</option><option>EUR</option><option>JPY</option><option>KRW</option><option>GBP</option><option>CAD</option>
              </select></div>
          </div>
          <div className="field"><label>Discount<span className="hint"> · fills in the price paid</span></label>
          <div className="discounts" role="group" aria-label="Discount">
            {DISCOUNTS.map(d => (
              <button key={d.off} type="button" className={'disc' + (discount === d.off ? ' on' : '')} onClick={() => { setCustomOff(''); applyDiscount(d.off) }}>
                <small>{d.zh}</small>{d.off}%
              </button>
            ))}
            <label className={'disc custom' + (discount != null && customOff ? ' on' : '')}>
              <small>other</small>
              <span><input inputMode="decimal" value={customOff} placeholder="__" aria-label="Other % off"
                onChange={e => { setCustomOff(e.target.value); const n = parseFloat(e.target.value); applyDiscount(Number.isFinite(n) ? n : null) }} />%</span>
            </label>
          </div>
          </div>
        </div>

        <div className="card">
          <h3>Usage<span className="opt">optional</span></h3>
          <div className="field qty-field"><label>How many<span className="hint"> · backups included</span></label>
            <div className="stepper">
              <button type="button" aria-label="One fewer" disabled={(f.quantity ?? 1) <= 0} onClick={() => set('quantity', Math.max(0, (f.quantity ?? 1) - 1))}>−</button>
              <span>{(f.quantity ?? 1) === 0 ? 'Used up' : f.quantity ?? 1}</span>
              <button type="button" aria-label="One more" disabled={(f.quantity ?? 1) >= 99} onClick={() => set('quantity', Math.min(99, (f.quantity ?? 1) + 1))}>+</button>
            </div></div>
          <div className="row">
            <div className="field"><label>Opened on</label>
              <input className="input" type="date" value={f.openedOn ?? ''} max={todayIso()}
                onChange={e => set('openedOn', e.target.value || null)} /></div>
            {!f.openedOn && <button type="button" className="btn small today-btn" onClick={() => set('openedOn', todayIso())}>Today</button>}
          </div>
          <div className="field"><label>Good for after opening<span className="hint"> · the open-jar symbol, e.g. 12M</span></label>
            <select className="input" value={f.paoMonths ?? ''} onChange={e => set('paoMonths', e.target.value ? +e.target.value : null)}>
              <option value="">—</option>
              {PAO_CHOICES.map(m => <option key={m} value={m}>{m} months ({m}M)</option>)}
            </select></div>
          <div className="row">
            <div className="field"><label>Batch code</label>
              <input className="input" value={f.batchCode ?? ''} onChange={e => set('batchCode', e.target.value)}
                placeholder="e.g. A12" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /></div>
            <div className="field"><label>Made in<span className="hint"> · month</span></label>
              <input className="input" type="month" value={f.manufacturedOn ?? ''} max={todayIso().slice(0, 7)} placeholder="YYYY-MM"
                onChange={e => set('manufacturedOn', e.target.value || null)} /></div>
          </div>
          <div className="hint">
            Batch codes work differently for every brand.{' '}
            <a href={BATCH_LOOKUP_URL} target="_blank" rel="noreferrer"
              onClick={() => { if (f.batchCode?.trim()) navigator.clipboard?.writeText(f.batchCode.trim()).catch(() => {}) }}>
              Look it up on CheckFresh
            </a>
            {f.batchCode?.trim() ? ' (the code is copied for you)' : ''}, then fill in the month it was made.
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
