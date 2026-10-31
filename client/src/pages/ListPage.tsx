import { useEffect, useMemo, useState } from 'react'
import { getCategories, type Product } from '../types'
import { hueSortKey } from '../color'
import PaletteGrid from '../components/PaletteGrid'
import { isMulti } from '../layout'
import DetailSheet from '../components/DetailSheet'
import Sheet from '../components/Sheet'
import { go } from '../App'

type Sort = 'hue' | 'new' | 'brand'

const words = (s?: string | null) => (s ?? '').toLowerCase().split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff#]+/).filter(Boolean)

/**
 * Search: every word you type must be the start of a word in the brand, product, shade or pan names
 * ("mac" finds MAC but not Chanel bought at Macy's; "ruby w" finds Ruby Woo). Brand also matches as a
 * whole phrase ("makeup by" → Makeup by Mario).
 */
function matches(p: Product, query: string) {
  const fields = [p.brand, p.name, p.shadeName, ...p.swatches.map(s => s.label)]
  const all = fields.flatMap(words)
  if ((p.brand ?? '').toLowerCase().startsWith(query)) return true
  return words(query).every(q => all.some(w => w.startsWith(q)))
}

const store = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

export default function ListPage({ items, error, category, openItem, onChanged }: {
  items: Product[] | null
  error: string | null
  category?: string
  /** item to show right away (e.g. coming from a "you already have this" prompt) */
  openItem?: string
  onChanged: () => Promise<void>
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of items ?? []) m[p.category] = (m[p.category] ?? 0) + 1
    return m
  }, [items])

  const cat = category ?? 'all'
  const total = items?.length ?? 0
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>(() => (store.get('sort') as Sort) || 'hue')
  const [openId, setOpenId] = useState<string | null>(openItem ?? null)
  useEffect(() => { if (openItem) setOpenId(openItem) }, [openItem])
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let list = (items ?? []).filter(p => cat === 'all' || p.category === cat)
    if (kw) list = list.filter(p => matches(p, kw))
    const sorted = [...list]
    if (sort === 'hue') sorted.sort((a, b) => (a.noColor ? 1 : 0) - (b.noColor ? 1 : 0) || hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex))
    if (sort === 'brand') sorted.sort((a, b) => a.brand.localeCompare(b.brand) || (a.shadeName ?? '').localeCompare(b.shadeName ?? ''))
    // 'new': the backend already returns newest first
    return sorted
  }, [items, cat, q, sort])

  const open = items?.find(p => p.id === openId)

  return (
    <div className="app">
      <header className="top">
        <div className="title-row">
          <h1 className="title">Vanity{total > 0 && <small>{total} {total === 1 ? "item" : "items"}</small>}</h1>
          <span className="spacer" />
          {(cat === 'all' ? total : counts[cat] ?? 0) > 0 && (
            <button className="link-btn" onClick={() => go(`/chart?c=${cat}`)}>View all as chart</button>
          )}
          <button className="icon-btn" aria-label="Settings: categories and brands" onClick={() => go('/settings')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <nav className="chips">
          <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => go('/')}>
            All{total ? <span className="n">{total}</span> : null}
          </button>
          {getCategories().map(c => (
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
            // no color card (clear products): show the product photo instead
            const multi = !p.noColor && isMulti(p)
            const hex = p.noColor ? null : p.swatches[0]?.hex
            return (
              <button key={p.id} className="item-card" onClick={() => setOpenId(p.id)}
                title={[p.brand, p.name, p.shadeName].filter(Boolean).join(' · ')}>
                {/* Home shows the color card: one block of color, or the palette in its real layout */}
                <div className={'ic-img' + (multi ? ' pal' : '')}
                  style={!multi && hex ? { background: hex } : undefined}>
                  {multi
                    ? <div className="ic-pal"><PaletteGrid p={p} /></div>
                    : !hex && (p.imagePath
                      ? <img src={p.imagePath} alt="" loading="lazy" />
                      : <span className="ic-empty">{p.noColor ? 'No picture yet' : 'No color yet'}</span>)}
                  {p.imagePath && (multi || hex) && <img className="ic-thumb" src={p.imagePath} alt="" loading="lazy" />}
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
            <button className="btn" onClick={() => go(cat === 'all' ? '/new' : `/new?c=${cat}`)}>
              <span className="ic">✏️</span>
              <span>Add one item<div className="sub">Type in the details yourself</div></span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
