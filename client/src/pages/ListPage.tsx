import FinishLayer from '../components/FinishLayer'
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { categoryOf, getCategories, type Product } from '../types'
import { hueSortKey } from '../color'
import PaletteGrid from '../components/PaletteGrid'
import { isMulti } from '../layout'
import DetailSheet, { formatPrice, Heart } from '../components/DetailSheet'
import Sheet from '../components/Sheet'
import { go } from '../App'

type Sort = 'hue' | 'new' | 'brand'
type View = 'cards' | 'list'

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
  /** only items marked with a heart (in whichever category is selected); remembered on this device */
  const [favOnly, setFavOnly] = useState(() => store.get('favOnly') === '1')
  const toggleFavOnly = () => setFavOnly(v => { store.set('favOnly', v ? '0' : '1'); return !v })

  // chip counts follow the heart filter
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of items ?? []) if (!favOnly || p.favorite) m[p.category] = (m[p.category] ?? 0) + 1
    return m
  }, [items, favOnly])

  const cat = category ?? 'all'
  const total = items?.length ?? 0
  const allCount = favOnly ? (items ?? []).filter(p => p.favorite).length : total
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>(() => (store.get('sort') as Sort) || 'hue')
  const [view, setView] = useState<View>(() => (store.get('view') === 'list' ? 'list' : 'cards'))
  const changeView = (v: View) => { setView(v); store.set('view', v) }
  const [openId, setOpenId] = useState<string | null>(openItem ?? null)
  useEffect(() => { if (openItem) setOpenId(openItem) }, [openItem])
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let list = (items ?? []).filter(p => (cat === 'all' || p.category === cat) && (!favOnly || p.favorite))
    if (kw) list = list.filter(p => matches(p, kw))
    const sorted = [...list]
    if (sort === 'hue') sorted.sort((a, b) => (a.noColor ? 1 : 0) - (b.noColor ? 1 : 0) || hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex))
    if (sort === 'brand') sorted.sort((a, b) => a.brand.localeCompare(b.brand) || (a.shadeName ?? '').localeCompare(b.shadeName ?? ''))
    // 'new': the backend already returns newest first
    return sorted
  }, [items, cat, q, sort, favOnly])

  const open = items?.find(p => p.id === openId)
  // position in the list as shown (current category, search and sort), for swiping between items
  const openIndex = open ? visible.findIndex(p => p.id === open.id) : -1

  // Swipe left/right on the list to go to the next/previous category (same order as the chips)
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const [slide, setSlide] = useState<'from-right' | 'from-left' | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    const target = e.target as Element
    // not with two fingers, not from the screen edges (Safari's back/forward swipe), not on the chip row
    // (it scrolls sideways itself), form fields, or an open sheet
    if (e.touches.length !== 1 || t.clientX < 24 || t.clientX > window.innerWidth - 24
      || target.closest('.chips, .sheet, .scrim, input, select, textarea')) { swipeStart.current = null; return }
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s || open || adding) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    // a quick, clearly sideways swipe; anything else is scrolling
    if (Date.now() - s.t > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const order = ['all', ...getCategories().map(c => c.key)]
    const i = Math.max(0, order.indexOf(cat))
    const next = order[i + (dx < 0 ? 1 : -1)]
    if (!next) return
    setSlide(dx < 0 ? 'from-right' : 'from-left')
    // replace, not push: swiping through categories shouldn't fill the back history
    location.replace('#' + (next === 'all' ? '/' : `/?c=${next}`))
  }

  // keep the selected chip in view when the category changes (by swipe or tap).
  // Scroll only the chip row: scrollIntoView would also scroll the page itself (sideways and up/down).
  useEffect(() => {
    const row = document.querySelector<HTMLElement>('.chips')
    const chip = row?.querySelector<HTMLElement>('.chip.on')
    if (!row || !chip) return
    row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' })
  }, [cat])

  return (
    <div className="app" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="top">
        <div className="title-row">
          <h1 className="title">Vanity{total > 0 && <small>{total} {total === 1 ? "item" : "items"}</small>}</h1>
          <span className="spacer" />
          {(cat === 'all' ? allCount : counts[cat] ?? 0) > 0 && (
            <button className="link-btn" onClick={() => go(`/chart?c=${cat}${favOnly ? '&fav=1' : ''}`)}>View all as chart</button>
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
            All{allCount ? <span className="n">{allCount}</span> : null}
          </button>
          {getCategories().map(c => (
            <button key={c.key} className={'chip' + (c.key === cat ? ' on' : '')} onClick={() => go(`/?c=${c.key}`)}>
              {c.label}{counts[c.key] ? <span className="n">{counts[c.key]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="tools">
          <input className="search" placeholder="Search brand, name, shade" value={q} onChange={e => setQ(e.target.value)} type="search" />
          <button type="button" className={'fav-filter' + (favOnly ? ' on' : '')} onClick={toggleFavOnly}
            aria-pressed={favOnly} aria-label="Only items with a heart" title="Only items with a heart">
            <Heart filled={favOnly} size={18} />
          </button>
          <select className="select" value={sort} onChange={e => { setSort(e.target.value as Sort); store.set('sort', e.target.value) }}>
            <option value="hue">By color</option>
            <option value="new">Newest</option>
            <option value="brand">By brand</option>
          </select>
          <div className="view-toggle" role="group" aria-label="View">
            <button type="button" className={view === 'cards' ? 'on' : ''} aria-label="View as cards" aria-pressed={view === 'cards'}
              onClick={() => changeView('cards')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
                <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
              </svg>
            </button>
            <button type="button" className={view === 'list' ? 'on' : ''} aria-label="View as list" aria-pressed={view === 'list'}
              onClick={() => changeView('list')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <rect x="3" y="4" width="5" height="5" rx="1.5" /><rect x="10" y="5.5" width="11" height="2" rx="1" />
                <rect x="3" y="15" width="5" height="5" rx="1.5" /><rect x="10" y="16.5" width="11" height="2" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div key={cat} className={'swipe-pane' + (slide ? ' ' + slide : '')} onAnimationEnd={() => setSlide(null)}>
      {error && <div className="empty">Can't reach the server: {error}</div>}
      {!error && items === null && <div className="empty">Loading…</div>}
      {!error && items && visible.length === 0 && (
        <div className="empty">
          <div className="big">{favOnly && !q ? '♡' : '🫙'}</div>
          {q ? 'No matches'
            : favOnly ? <>No hearts here yet. Open an item and tap ♡ to mark it as a favorite.</>
            : 'Nothing here yet. Tap + to add one.'}
        </div>
      )}

      {visible.length > 0 && view === 'list' && (
        <div className="list-rows">
          {visible.map(p => {
            const price = formatPrice(p.paidPrice ?? p.originalPrice, p.currency)
            return (
              <button key={p.id} className="list-row" onClick={() => setOpenId(p.id)}>
                <RowSwatch p={p} />
                <span className="lr-text">
                  <span className="lr-brand">{p.brand}</span>
                  <span className="lr-shade">{p.favorite && <span className="fav-mark"><Heart filled size={13} /></span>}{p.shadeName || p.name}</span>
                  {p.shadeName && p.name && <span className="lr-name">{p.name}</span>}
                </span>
                {(price || cat === 'all') && (
                  <span className="lr-meta">
                    {price && <span className="lr-price">{price}</span>}
                    {cat === 'all' && <span className="lr-cat">{categoryOf(p.category).label}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {visible.length > 0 && view === 'cards' && (
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
                  {!multi && hex && <FinishLayer finish={p.swatches[0]?.finish} />}
                  {multi
                    ? <div className="ic-pal"><PaletteGrid p={p} /></div>
                    : !hex && (p.imagePath
                      ? <img src={p.imagePath} alt="" loading="lazy" />
                      : <span className="ic-empty">{p.noColor ? 'No picture yet' : 'No color yet'}</span>)}
                  {p.imagePath && (multi || hex) && <img className="ic-thumb" src={p.imagePath} alt="" loading="lazy" />}
                  {p.favorite && <span className="ic-fav" aria-label="Favorite"><Heart filled size={15} /></span>}
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

      </div>

      <button className="fab" aria-label="Add" onClick={() => setAdding(true)}>+</button>

      {open && (
        <DetailSheet p={open} onClose={() => setOpenId(null)}
          onDeleted={async () => { setOpenId(null); await onChanged() }} onChanged={onChanged}
          nav={openIndex < 0 ? undefined : {
            index: openIndex,
            total: visible.length,
            onPrev: openIndex > 0 ? () => setOpenId(visible[openIndex - 1].id) : undefined,
            onNext: openIndex < visible.length - 1 ? () => setOpenId(visible[openIndex + 1].id) : undefined,
          }} />
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

/** Small color thumbnail for list rows: the color, the palette/split in its layout, or the photo */
function RowSwatch({ p }: { p: Product }) {
  const multi = !p.noColor && isMulti(p)
  const hex = p.noColor ? null : p.swatches[0]?.hex
  const photo = !multi && !hex && p.imagePath
  return (
    <span className={'lr-sw' + (multi ? ' pal' : '') + (photo ? ' photo' : '')} style={!multi && hex ? { background: hex } : undefined}>
      {multi ? <PaletteGrid p={p} /> : photo ? <img src={p.imagePath!} alt="" loading="lazy" /> : hex ? <FinishLayer finish={p.swatches[0]?.finish} /> : null}
    </span>
  )
}
