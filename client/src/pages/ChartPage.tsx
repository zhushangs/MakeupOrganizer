import { Fragment, useEffect, useMemo, useState } from 'react'
import { renderChart } from '../cards'
import { hueSortKey } from '../color'
import { categoryOf, getCategories, type Product } from '../types'
import { go } from '../App'

/** "View all": every item in a category on one color chart image (long-press to save). */
export default function ChartPage({ items, category, favOnly = false }: { items: Product[] | null; category: string; favOnly?: boolean }) {
  const base = category === 'all' ? { key: 'all', label: 'All makeup' } : categoryOf(category)
  // "Favorite blush": only items with a heart (when the home page's heart filter is on)
  const cat = favOnly ? { key: base.key, label: base.key === 'all' ? 'Favorites' : `Favorite ${base.label.toLowerCase()}` } : base
  const byColor = (a: Product, b: Product) =>
    (a.noColor ? 1 : 0) - (b.noColor ? 1 : 0) || hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex)

  // "All": one section per category (in your category order), each sorted by color
  const sections = useMemo(() => {
    const list = (items ?? []).filter(p => !favOnly || p.favorite)
    if (cat.key !== 'all') return [{ items: list.filter(p => p.category === cat.key).sort(byColor) }]
    return getCategories()
      .map(c => ({ label: c.label, items: list.filter(p => categoryOf(p.category).key === c.key).sort(byColor) }))
      .filter(s => s.items.length)
  }, [items, cat.key, favOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasItems = sections.some(s => s.items.length)
  // switch between every item and only hearted ones (replace: the Back button still goes home)
  const favCount = (items ?? []).filter(p => p.favorite && (base.key === 'all' || p.category === base.key)).length
  const showFav = (on: boolean) => location.replace(`#/chart?c=${base.key}${on ? '&fav=1' : ''}`)
  const [srcs, setSrcs] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setSrcs(null); setError(null)
    if (!hasItems) return
    renderChart(cat.label, sections)
      .then(urls => { if (alive) setSrcs(urls) })
      .catch(e => { if (alive) setError((e as Error).message || "Couldn't make the chart") })
    return () => { alive = false }
  }, [sections, cat.label, hasItems])

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go(cat.key === 'all' ? '/' : `/?c=${cat.key}`))}>‹ Back</button>
        <h2>{cat.label} chart</h2>
        <span style={{ width: 52 }} />
      </div>
      {items && (favOnly || favCount > 0) && (
        <div className="chart-scope">
          <div className="seg">
            <button type="button" className={favOnly ? '' : 'on'} onClick={() => showFav(false)}>All</button>
            <button type="button" className={favOnly ? 'on' : ''} onClick={() => showFav(true)}>♥ Favorites{favCount ? ` (${favCount})` : ''}</button>
          </div>
        </div>
      )}
      {!items && <div className="empty">Loading…</div>}
      {items && !srcs && !error && <div className="empty">{hasItems ? 'Making the chart…' : `No ${cat.label.toLowerCase()} yet`}</div>}
      {error && <div className="empty"><div className="err">{error}</div></div>}
      {srcs && (
        <div className="form">
          {srcs.length > 1 && (
            <div className="hint" style={{ textAlign: 'center' }}>
              Split into {srcs.length} images so each one can be saved on a phone.
            </div>
          )}
          {srcs.map((src, i) => (
            <Fragment key={i}>
              <img className="chart-img" src={src} alt={`${cat.label} color chart${srcs.length > 1 ? `, part ${i + 1}` : ''}`} />
              <a className="btn" style={{ textAlign: 'center', textDecoration: 'none' }} href={src}
                download={`${favOnly ? 'favorite-' : ''}${cat.key}-chart${srcs.length > 1 ? `-${i + 1}` : ''}.png`}>
                Download{srcs.length > 1 ? ` part ${i + 1}` : ''}
              </a>
            </Fragment>
          ))}
          <div className="hint" style={{ textAlign: 'center' }}>On your phone: press and hold a chart → <b>Save to Photos</b></div>
        </div>
      )}
    </div>
  )
}
