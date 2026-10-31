import { useMemo, useState } from 'react'
import PaletteLayout from '../components/PaletteLayout'
import { newCategoryKey, type AppSettings, type Category, type Product } from '../types'
import { go } from '../App'

/** Manage categories (add / rename / reorder / remove) and the user's own brand list. */
export default function SettingsPage({ items, settings, onSave }: {
  items: Product[] | null
  settings: AppSettings
  onSave: (s: AppSettings) => Promise<void>
}) {
  const [cats, setCats] = useState<Category[]>(() => settings.categories.map(c => ({ ...c })))
  const [brands, setBrands] = useState<string[]>(() => [...settings.brands])
  const [newCat, setNewCat] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const usage = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of items ?? []) m[p.category] = (m[p.category] ?? 0) + 1
    return m
  }, [items])
  const ownedBrands = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of items ?? []) if (p.brand.trim()) set.set(p.brand.trim().toLowerCase(), p.brand.trim())
    return [...set.values()].filter(b => !brands.some(x => x.toLowerCase() === b.toLowerCase())).sort((a, b) => a.localeCompare(b))
  }, [items, brands])

  const dirty = JSON.stringify(cats) !== JSON.stringify(settings.categories) || JSON.stringify(brands) !== JSON.stringify(settings.brands)

  const patch = (key: string, p: Partial<Category>) => setCats(cs => cs.map(c => (c.key === key ? { ...c, ...p } : c)))
  const move = (i: number, d: number) => setCats(cs => {
    const j = i + d
    if (j < 0 || j >= cs.length) return cs
    const next = [...cs];[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const addCat = () => {
    const label = newCat.trim()
    if (!label) return
    if (cats.some(c => c.label.toLowerCase() === label.toLowerCase())) { setMessage({ ok: false, text: `"${label}" already exists` }); return }
    const key = newCategoryKey(label, cats.map(c => c.key))
    setCats(cs => [...cs.filter(c => c.key !== 'other'), { key, label, multi: false, defaultRows: 1, defaultCols: 1 }, ...cs.filter(c => c.key === 'other')])
    setNewCat('')
    setMessage(null)
  }

  const addBrand = (b = newBrand) => {
    const name = b.trim()
    if (!name) return
    if (!brands.some(x => x.toLowerCase() === name.toLowerCase())) setBrands(bs => [...bs, name].sort((a, c) => a.localeCompare(c)))
    setNewBrand('')
  }

  const save = async () => {
    if (cats.some(c => !c.label.trim())) { setMessage({ ok: false, text: 'Every category needs a name' }); return }
    setSaving(true); setMessage(null)
    try {
      await onSave({ categories: cats.map(c => ({ ...c, label: c.label.trim() })), brands })
      setMessage({ ok: true, text: 'Saved' })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go('/'))}>‹ Back</button>
        <h2>Categories &amp; brands</h2>
        <span style={{ width: 52 }} />
      </div>

      <div className="form">
        <div className="card">
          <h3>Categories<span className="opt">rename, reorder, add</span></h3>
          {cats.map((c, i) => {
            const used = usage[c.key] ?? 0
            const removable = c.key !== 'other' && used === 0
            return (
              <div key={c.key} className="cat-row">
                <div className="cat-main">
                  <div className="cat-move">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button type="button" aria-label="Move down" disabled={i === cats.length - 1} onClick={() => move(i, 1)}>▼</button>
                  </div>
                  <input className="input" value={c.label} onChange={e => patch(c.key, { label: e.target.value })} aria-label="Category name" />
                  <span className="cat-count">{used || ''}</span>
                  <button type="button" className="icon-x" disabled={!removable} aria-label={`Remove ${c.label}`}
                    title={c.key === 'other' ? '"Other" is always kept' : used ? `Used by ${used} item${used === 1 ? '' : 's'}` : 'Remove'}
                    onClick={() => setCats(cs => cs.filter(x => x.key !== c.key))}>×</button>
                </div>
                <div className="cat-opts">
                  <label className="check small">
                    <input type="checkbox" checked={c.multi}
                      onChange={e => patch(c.key, e.target.checked
                        ? { multi: true, defaultRows: Math.max(c.defaultRows, 2), defaultCols: Math.max(c.defaultCols, 2) }
                        : { multi: false, defaultRows: 1, defaultCols: 1 })} />
                    Palette (several pans)
                  </label>
                  {c.multi && (
                    <button type="button" className="link-btn small" onClick={() => setExpanded(expanded === c.key ? null : c.key)}>
                      Default layout {c.defaultRows}×{c.defaultCols} {expanded === c.key ? '▴' : '▾'}
                    </button>
                  )}
                </div>
                {c.multi && expanded === c.key && (
                  <PaletteLayout rows={c.defaultRows} cols={c.defaultCols} onChange={(r, col) => patch(c.key, { defaultRows: r, defaultCols: col })} />
                )}
              </div>
            )
          })}
          <div className="link-row">
            <input className="input" placeholder="New category, e.g. Mascara" value={newCat}
              onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
            <button type="button" className="btn" onClick={addCat} disabled={!newCat.trim()}>Add</button>
          </div>
          <div className="hint">A category can only be removed when no items use it. The number shows how many items are in it.</div>
        </div>

        <div className="card">
          <h3>My brands<span className="opt">for suggestions and screenshot import</span></h3>
          <div className="brand-chips">
            {brands.length === 0 && <span className="hint">No brands added yet.</span>}
            {brands.map(b => (
              <span key={b} className="brand-chip">
                {b}
                <button type="button" aria-label={`Remove ${b}`} onClick={() => setBrands(bs => bs.filter(x => x !== b))}>×</button>
              </span>
            ))}
          </div>
          <div className="link-row">
            <input className="input" placeholder="Add a brand, e.g. EADEM" value={newBrand}
              onChange={e => setNewBrand(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBrand()} />
            <button type="button" className="btn" onClick={() => addBrand()} disabled={!newBrand.trim()}>Add</button>
          </div>
          {ownedBrands.length > 0 && (
            <>
              <div className="hint">Brands you already own are suggested automatically. Tap to keep one in your list:</div>
              <div className="brand-chips">
                {ownedBrands.map(b => (
                  <button key={b} type="button" className="brand-chip ghost" onClick={() => addBrand(b)}>+ {b}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {message && <div className={message.ok ? 'hint' : 'err'} style={{ textAlign: 'center' }}>{message.text}</div>}
      </div>

      <div className="save-bar">
        <button className="btn primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <span className="spinner" /> : dirty ? 'Save changes' : 'All changes saved'}
        </button>
      </div>
    </div>
  )
}
