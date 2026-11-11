import { useMemo, useState } from 'react'
import PaletteLayout from '../components/PaletteLayout'
import { GROUPS, STARTER_SKINCARE, groupOf, newCategoryKey, type AppSettings, type Category, type Group, type Product } from '../types'
import { go } from '../App'

/** Manage categories (add / rename / reorder / remove) and the user's own brand list. */
export default function SettingsPage({ items, settings, onSave, initialGroup }: {
  items: Product[] | null
  settings: AppSettings
  onSave: (s: AppSettings) => Promise<void>
  /** open on the skincare categories */
  initialGroup?: Group
}) {
  // the list shows one half at a time: makeup or skincare categories
  const [group, setGroup] = useState<Group>(initialGroup ?? 'makeup')
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
  const shown = cats.filter(c => groupOf(c) === group)
  // move within this half: swap with the nearest category of the same group
  const move = (key: string, d: number) => setCats(cs => {
    const i = cs.findIndex(c => c.key === key)
    let j = i + d
    while (j >= 0 && j < cs.length && groupOf(cs[j]) !== groupOf(cs[i])) j += d
    if (j < 0 || j >= cs.length) return cs
    const next = [...cs];[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  /** a new category for the half being shown (skincare ones start without a color card) */
  const make = (label: string, taken: string[]): Category => ({
    key: newCategoryKey(label, taken), label, multi: false, defaultRows: 1, defaultCols: 1,
    group, ...(group === 'skincare' ? { noColor: true } : {}),
  })
  const insert = (cs: Category[], add: Category[]) => [...cs.filter(c => c.key !== 'other'), ...add, ...cs.filter(c => c.key === 'other')]
  const addStarter = () => setCats(cs => {
    const add: Category[] = []
    for (const label of STARTER_SKINCARE) {
      if (cs.some(c => c.label.toLowerCase() === label.toLowerCase()) || add.some(c => c.label === label)) continue
      add.push(make(label, [...cs, ...add].map(c => c.key)))
    }
    return insert(cs, add)
  })

  const addCat = () => {
    const label = newCat.trim()
    if (!label) return
    if (cats.some(c => c.label.toLowerCase() === label.toLowerCase())) { setMessage({ ok: false, text: `"${label}" already exists` }); return }
    setCats(cs => insert(cs, [make(label, cs.map(c => c.key))]))
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
          <div className="seg group-seg in-form">
            {GROUPS.map(g => (
              <button key={g.key} type="button" className={g.key === group ? 'on' : ''} onClick={() => { setGroup(g.key); setExpanded(null) }}>
                {g.label} <span className="n">{cats.filter(c => groupOf(c) === g.key).length}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 && (
            <div className="empty-cats">
              No {group} categories yet.
              {group === 'skincare' && (
                <button type="button" className="btn small primary" onClick={addStarter}>Add the usual ones: {STARTER_SKINCARE.join(', ')}</button>
              )}
            </div>
          )}
          {shown.map((c, i) => {
            const used = usage[c.key] ?? 0
            const removable = c.key !== 'other' && used === 0
            return (
              <div key={c.key} className="cat-row">
                <div className="cat-main">
                  <div className="cat-move">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(c.key, -1)}>▲</button>
                    <button type="button" aria-label="Move down" disabled={i === shown.length - 1} onClick={() => move(c.key, 1)}>▼</button>
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
                  <label className="check small">
                    <input type="checkbox" checked={!!c.noColor} onChange={e => patch(c.key, { noColor: e.target.checked || undefined })} />
                    No color card for new items
                  </label>
                  {c.key !== 'other' && (
                    <button type="button" className="link-btn small" onClick={() => patch(c.key, { group: group === 'makeup' ? 'skincare' : 'makeup' })}>
                      Move to {group === 'makeup' ? 'Skincare' : 'Makeup'}
                    </button>
                  )}
                  {c.multi && (
                    <button type="button" className="link-btn small" onClick={() => setExpanded(expanded === c.key ? null : c.key)}>
                      Default layout {c.defaultRows}×{c.defaultCols} {expanded === c.key ? '▴' : '▾'}
                    </button>
                  )}
                </div>
                {c.multi && expanded === c.key && (
                  <PaletteLayout allowCustom={false} value={{ gridRows: c.defaultRows, gridCols: c.defaultCols }}
                    onChange={s => patch(c.key, { defaultRows: s.gridRows, defaultCols: s.gridCols })} />
                )}
              </div>
            )
          })}
          <div className="link-row">
            <input className="input" placeholder={group === 'skincare' ? 'New category, e.g. Essence' : 'New category, e.g. Mascara'} value={newCat}
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

        {/* only does something on the password-protected Cloudflare version */}
        <a className="link-btn small" href="/logout" style={{ alignSelf: 'center', textDecoration: 'none' }}>Sign out</a>
      </div>

      <div className="save-bar">
        <button className="btn primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <span className="spinner" /> : dirty ? 'Save changes' : 'All changes saved'}
        </button>
      </div>
    </div>
  )
}
