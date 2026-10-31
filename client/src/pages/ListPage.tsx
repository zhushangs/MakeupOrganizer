import { useMemo, useState } from 'react'
import { CATEGORIES, type Product } from '../types'
import { hueSortKey } from '../color'
import PaletteGrid from '../components/PaletteGrid'
import DetailSheet from '../components/DetailSheet'
import Sheet from '../components/Sheet'
import { go } from '../App'

type Sort = 'hue' | 'new' | 'brand'

const store = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

export default function ListPage({ items, error, category, onChanged }: {
  items: Product[] | null
  error: string | null
  category?: string
  onChanged: () => Promise<void>
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of items ?? []) m[p.category] = (m[p.category] ?? 0) + 1
    return m
  }, [items])

  const cat = category ?? CATEGORIES.find(c => counts[c.key])?.key ?? 'lipstick'
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>(() => (store.get('sort') as Sort) || 'hue')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let list = (items ?? []).filter(p => p.category === cat)
    if (kw) list = list.filter(p => [p.brand, p.name, p.shadeName, p.channel, ...p.swatches.map(s => s.label)]
      .some(x => x?.toLowerCase().includes(kw)))
    const sorted = [...list]
    if (sort === 'hue') sorted.sort((a, b) => hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex))
    if (sort === 'brand') sorted.sort((a, b) => a.brand.localeCompare(b.brand) || (a.shadeName ?? '').localeCompare(b.shadeName ?? ''))
    // 'new': the backend already returns newest first
    return sorted
  }, [items, cat, q, sort])

  const open = items?.find(p => p.id === openId)
  const total = items?.length ?? 0

  return (
    <div className="app">
      <header className="top">
        <div className="title-row">
          <h1 className="title">Vanity{total > 0 && <small>{total} items</small>}</h1>
          {(counts[cat] ?? 0) > 0 && (
            <button className="link-btn" onClick={() => go(`/chart?c=${cat}`)}>View all as chart</button>
          )}
        </div>
        <nav className="chips">
          {CATEGORIES.map(c => (
            <button key={c.key} className={'chip' + (c.key === cat ? ' on' : '')} onClick={() => go(`/?c=${c.key}`)}>
              {c.label}{counts[c.key] ? <span className="n">{counts[c.key]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="tools">
          <input className="search" placeholder="Search brand, name, shade" value={q} onChange={e => setQ(e.target.value)} type="search" />
          <select className="select" value={sort} onChange={e => { setSort(e.target.value as Sort); store.set('sort', e.target.value) }}>
            <option value="hue">By color</option>
            <option value="new">Newest</option>
            <option value="brand">By brand</option>
          </select>
        </div>
      </header>

      {error && <div className="empty">Can't reach the server: {error}</div>}
      {!error && items === null && <div className="empty">Loading…</div>}
      {!error && items && visible.length === 0 && (
        <div className="empty">
          <div className="big">🫙</div>
          {q ? 'No matches' : 'Nothing here yet. Tap + to add one.'}
        </div>
      )}

      {visible.length > 0 && (
        <div className="cards">
          {visible.map(p => {
            const multi = p.gridRows * p.gridCols > 1
            const hex = p.swatches[0]?.hex
            return (
              <button key={p.id} className="item-card" onClick={() => setOpenId(p.id)}>
                <div className="ic-img" style={!p.imagePath && !multi && hex ? { background: hex } : undefined}>
                  {p.imagePath
                    ? <img src={p.imagePath} alt="" loading="lazy" />
                    : multi ? <div className="ic-pal"><PaletteGrid p={p} /></div>
                    : !hex && <span className="ic-empty">No picture yet</span>}
                  {p.imagePath && (multi
                    ? <div className="ic-chip-pal"><PaletteGrid p={p} /></div>
                    : hex && <span className="ic-chip" style={{ background: hex }} />)}
                </div>
                <div className="ic-text">
                  <div className="ic-brand">{p.brand}</div>
                  <div className="ic-shade">{p.shadeName || p.name}</div>
                  {p.shadeName && p.name && <div className="ic-name">{p.name}</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <button className="fab" aria-label="Add" onClick={() => setAdding(true)}>+</button>

      {open && (
        <DetailSheet p={open} onClose={() => setOpenId(null)}
          onDeleted={async () => { setOpenId(null); await onChanged() }} />
      )}

      {adding && (
        <Sheet onClose={() => setAdding(false)}>
          <div className="choice">
            <button className="btn" onClick={() => go('/import')}>
              <span className="ic">🧾</span>
              <span>Import from screenshots<div className="sub">Order or cart screenshots. Brand, product, shade and prices are filled in for you to check.</div></span>
            </button>
            <button className="btn" onClick={() => go(`/new?c=${cat}`)}>
              <span className="ic">✏️</span>
              <span>Add one item<div className="sub">Type in the details yourself</div></span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
