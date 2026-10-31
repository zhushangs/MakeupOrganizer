import { useMemo } from 'react'
import { renderChart } from '../cards'
import { hueSortKey } from '../color'
import { categoryOf, type Product } from '../types'
import { go } from '../App'

/** "View all": every item in a category on one color chart image (long-press to save). */
export default function ChartPage({ items, category }: { items: Product[] | null; category: string }) {
  const cat = category === 'all' ? { key: 'all', label: 'All makeup' } : categoryOf(category)
  const list = useMemo(() => (items ?? [])
    .filter(p => cat.key === 'all' || p.category === cat.key)
    .sort((a, b) => hueSortKey(a.swatches[0]?.hex) - hueSortKey(b.swatches[0]?.hex)), [items, cat.key])

  const src = useMemo(() => list.length ? renderChart(cat.label, list) : null, [list, cat.label])

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go(cat.key === 'all' ? '/' : `/?c=${cat.key}`))}>‹ Back</button>
        <h2>{cat.label} chart</h2>
        <span style={{ width: 52 }} />
      </div>
      {!items && <div className="empty">Loading…</div>}
      {items && !src && <div className="empty">No {cat.label.toLowerCase()} yet</div>}
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
