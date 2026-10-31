import { isDark } from '../color'
import { categoryOf, type Product } from '../types'

/** On-screen color card for one product (the PNG version is drawn in cards.ts). */
export default function SwatchCard({ p }: { p: Product }) {
  const multi = p.gridRows * p.gridCols > 1
  const hex = p.swatches[0]?.hex
  return (
    <div className="swatch-card">
      {multi ? (
        <div className="sc-grid" style={{ gridTemplateColumns: `repeat(${p.gridCols}, 1fr)` }}>
          {p.swatches.map((s, i) => (
            <div key={i} className="sc-pan" style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}>
              {s.label}
            </div>
          ))}
        </div>
      ) : (
        <div className="sc-color" style={{ background: hex ?? undefined, color: isDark(hex) ? 'rgba(255,255,255,.85)' : 'rgba(42,35,33,.7)' }}>
          {hex ? hex.toUpperCase() : 'No color yet'}
        </div>
      )}
      <div className="sc-text">
        <div className="sc-brand">{p.brand || categoryOf(p.category).label}</div>
        <div className="sc-shade">{p.shadeName || p.name}</div>
        {p.shadeName && p.name && <div className="sc-name">{p.name}</div>}
      </div>
    </div>
  )
}
