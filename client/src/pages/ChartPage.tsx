import { Fragment, useEffect, useMemo, useState } from 'react'
import { renderChart } from '../cards'
import { hueSortKey } from '../color'
import { categoryOf, getCategories, type Product } from '../types'
import { go } from '../App'

/** "View all": every item in a category on one color chart image (long-press to save). */
export default function ChartPage({ items, category }: { items: Product[] | null; category: string }) {
  const cat = category === 'all' ? { key: 'all', label: 'All makeup' } : categoryOf(category)
  const byColor = (a: Product, b: Product) =>
    (a.noColor ? 1 : 0) - (b.noColor ? 1 : 0) || hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex)

  // "All": one section per category (in your category order), each sorted by color
  const sections = useMemo(() => {
    const list = items ?? []
    if (cat.key !== 'all') return [{ items: list.filter(p => p.category === cat.key).sort(byColor) }]
    return getCategories()
      .map(c => ({ label: c.label, items: list.filter(p => categoryOf(p.category).key === c.key).sort(byColor) }))
      .filter(s => s.items.length)
  }, [items, cat.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasItems = sections.some(s => s.items.length)
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
                download={`${cat.key}-chart${srcs.length > 1 ? `-${i + 1}` : ''}.png`}>
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
