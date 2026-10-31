import { useRef, useState } from 'react'
import { api } from '../api'
import { recognizeText } from '../ocr'
import { parseReceipt } from '../receipt'
import { categoryOf, getCategories, type Product, type ProductInput } from '../types'
import { findDuplicate } from '../dup'
import DetailSheet from '../components/DetailSheet'
import { go } from '../App'

interface Row {
  key: number
  include: boolean
  category: string
  brand: string
  name: string
  shadeName: string
  channel: string
  original: string
  paid: string
}

interface Shot {
  key: number
  name: string
  status: 'reading' | 'done' | 'error'
  progress: number
  text?: string
  found?: number
  error?: string
}

let nextKey = 1
const fmt = (n: number | null) => (n == null ? '' : String(n))
const num = (s: string) => {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return s.trim() && Number.isFinite(n) ? n : null
}

/** Import items from shopping screenshots: OCR on the phone, then review/fix before saving. */
export default function ImportPage({ items, brands, onSaved }: {
  items: Product[] | null
  brands: string[]
  onSaved: (firstCategory: string) => void
}) {
  const [shots, setShots] = useState<Shot[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<Product | null>(null)

  /** Already owned, or the same thing appears earlier in this import (e.g. a screenshot picked twice) */
  const dupOf = (r: Row, index: number, all: Row[]) => {
    const owned = findDuplicate(items, r)
    if (owned) return { owned }
    const asProduct = (x: Row) => ({ id: String(x.key), brand: x.brand, name: x.name, shadeName: x.shadeName }) as Product
    const earlier = findDuplicate(all.slice(0, index).map(asProduct), r)
    return earlier ? { earlierIndex: all.findIndex(x => String(x.key) === earlier.id) } : null
  }

  const patchShot = (key: number, p: Partial<Shot>) => setShots(s => s.map(x => (x.key === key ? { ...x, ...p } : x)))
  const patchRow = (key: number, p: Partial<Row>) => setRows(r => r.map(x => (x.key === key ? { ...x, ...p } : x)))

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    const added = list.map(f => ({ key: nextKey++, name: f.name, status: 'reading' as const, progress: 0 }))
    setShots(s => [...s, ...added])
    if (fileRef.current) fileRef.current.value = ''
    // one at a time: the OCR worker is single-threaded
    for (let i = 0; i < list.length; i++) {
      const shot = added[i]
      try {
        const { text, raw } = await recognizeText(list[i], p => patchShot(shot.key, { progress: p }))
        const parsed = parseReceipt(text, raw)
        setRows(r => uncheckDuplicates([...r, ...parsed.items.map(it => ({
          key: nextKey++, include: true,
          category: it.category, brand: it.brand ?? '', name: it.name ?? '', shadeName: it.shadeName ?? '',
          channel: parsed.channel ?? '', original: fmt(it.originalPrice), paid: fmt(it.paidPrice),
        }))], r.length))
        patchShot(shot.key, { status: 'done', progress: 1, text, found: parsed.items.length })
      } catch (e) {
        patchShot(shot.key, { status: 'error', error: (e as Error).message || 'Could not read this image' })
      }
    }
  }

  /** New rows that duplicate something start unchecked */
  const uncheckDuplicates = (all: Row[], firstNew: number) =>
    all.map((r, i) => (i >= firstNew && dupOf(r, i, all) ? { ...r, include: false } : r))

  const addBlank = () => setRows(r => [...r, {
    key: nextKey++, include: true, category: getCategories()[0]?.key ?? 'other', brand: '', name: '', shadeName: '',
    channel: r[r.length - 1]?.channel ?? '', original: '', paid: '',
  }])

  const chosen = rows.filter(r => r.include && (r.brand.trim() || r.name.trim()))
  const reading = shots.some(s => s.status === 'reading')

  const save = async () => {
    setSaving(true); setError(null)
    try {
      for (const r of chosen) {
        const c = categoryOf(r.category)
        const body: ProductInput = {
          category: c.key, brand: r.brand.trim(), name: r.name.trim(), shadeName: r.shadeName.trim() || null,
          channel: r.channel.trim() || null, originalPrice: num(r.original), paidPrice: num(r.paid), currency: 'USD',
          imagePath: null, gridRows: c.defaultRows, gridCols: c.defaultCols,
          swatches: Array.from({ length: c.defaultRows * c.defaultCols }, () => ({})), notes: null,
        }
        await api.create(body)
        patchRow(r.key, { include: false }) // so a retry after an error doesn't duplicate
      }
      onSaved(chosen[0]?.category ?? 'lipstick')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go('/'))}>‹ Back</button>
        <h2>Import screenshots</h2>
        <span style={{ width: 52 }} />
      </div>

      <div className="form">
        <div className="card">
          <h3>Order or cart screenshots</h3>
          <div className="hint">
            Pick one or more screenshots (Sephora, Ulta, Amazon…). Text is read on this device; then check the
            items below and fill in anything that's missing. You can add pictures and notes later.
          </div>
          <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <><span className="spinner" /> Reading…</> : shots.length ? 'Add more screenshots' : 'Choose screenshots'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => onFiles(e.target.files)} />

          {shots.map(s => (
            <div key={s.key} className="shot">
              <div className="shot-row">
                <span className="shot-name">{s.name}</span>
                <span className="shot-status">
                  {s.status === 'reading' && `${Math.round(s.progress * 100)}%`}
                  {s.status === 'done' && `${s.found} found`}
                  {s.status === 'error' && 'failed'}
                </span>
              </div>
              {s.status === 'reading' && <div className="bar"><div style={{ width: `${Math.max(4, s.progress * 100)}%` }} /></div>}
              {s.status === 'error' && <div className="err">{s.error}</div>}
              {s.text && (
                <details className="ocr-text">
                  <summary>Recognized text</summary>
                  <pre>{s.text}</pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {rows.map((r, i) => (
          <div key={r.key} className={'card draft' + (r.include ? '' : ' off')}>
            <div className="draft-head">
              <label className="check">
                <input type="checkbox" checked={r.include} onChange={e => patchRow(r.key, { include: e.target.checked })} />
                Item {i + 1}
              </label>
              <select className="select small" value={r.category} onChange={e => patchRow(r.key, { category: e.target.value })}>
                {getCategories().map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            {(() => {
              const d = dupOf(r, i, rows)
              if (!d) return null
              return d.owned ? (
                <div className="warn draft-dup">
                  Already in your vanity: <b>{[d.owned.brand, d.owned.shadeName || d.owned.name].filter(Boolean).join(' · ')}</b>.{' '}
                  <button type="button" className="link-btn" onClick={() => setViewing(d.owned!)}>View it</button>
                </div>
              ) : <div className="warn draft-dup">Same as item {(d.earlierIndex ?? 0) + 1} above.</div>
            })()}
            <div className="row">
              <div className="field"><label>Brand</label>
                <input className="input" list="brand-list" value={r.brand} onChange={e => patchRow(r.key, { brand: e.target.value })} /></div>
              <div className="field"><label>Shade</label>
                <input className="input" value={r.shadeName} onChange={e => patchRow(r.key, { shadeName: e.target.value })} /></div>
            </div>
            <div className="field"><label>Product name</label>
              <input className="input" value={r.name} onChange={e => patchRow(r.key, { name: e.target.value })} /></div>
            <div className="row">
              <div className="field"><label>Bought at</label>
                <input className="input" value={r.channel} onChange={e => patchRow(r.key, { channel: e.target.value })} /></div>
              <div className="field" style={{ flex: '0 0 84px' }}><label>Original</label>
                <input className="input" inputMode="decimal" value={r.original} onChange={e => patchRow(r.key, { original: e.target.value })} /></div>
              <div className="field" style={{ flex: '0 0 84px' }}><label>Paid</label>
                <input className="input" inputMode="decimal" value={r.paid} onChange={e => patchRow(r.key, { paid: e.target.value })} /></div>
            </div>
          </div>
        ))}

        {shots.some(s => s.status === 'done') && (
          <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={addBlank}>+ Add an item it missed</button>
        )}
        {error && <div className="err">{error}</div>}
      </div>

      <datalist id="brand-list">{brands.map(b => <option key={b} value={b} />)}</datalist>
      {viewing && <DetailSheet p={viewing} onClose={() => setViewing(null)} onDeleted={() => setViewing(null)} />}

      {rows.length > 0 && (
        <div className="save-bar">
          <button className="btn primary" onClick={save} disabled={saving || reading || chosen.length === 0}>
            {saving ? <span className="spinner" /> : `Save ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`}
          </button>
        </div>
      )}
    </div>
  )
}
