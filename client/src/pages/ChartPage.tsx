import { useEffect, useMemo, useState } from 'react'
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

  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!sections.some(s => s.items.length)) { setSrc(null); return }
    renderChart(cat.label, sections).then(url => alive && setSrc(url))
    return () => { alive = false }
  }, [sections, cat.label])

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go(cat.key === 'all' ? '/' : `/?c=${cat.key}`))}>‹ Back</button>
        <h2>{cat.label} chart</h2>
        <span style={{ width: 52 }} />
      </div>
      {!items && <div className="empty">Loading…</div>}
      {items && !src && <div className="empty">{sections.some(s => s.items.length) ? 'Making the chart…' : `No ${cat.label.toLowerCase()} yet`}</div>}
      {src && (
        <div className="form">
          <img className="chart-img" src={src} alt={`${cat.label} color chart`} />
          <div className="hint" style={{ textAlign: 'center' }}>On your phone: press and hold the chart → <b>Save to Photos</b></div>
          <a className="btn" style={{ textAlign: 'center', textDecoration: 'none' }} href={src}
            download={`${cat.key}-chart.png`}>Download</a>
        </div>
      )}
    </div>
  )
}
