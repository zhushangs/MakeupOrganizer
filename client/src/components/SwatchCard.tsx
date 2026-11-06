import FinishLayer from './FinishLayer'
import { isDark } from '../color'
import { categoryOf, type Product } from '../types'
import { isMulti, isSplitProduct } from '../layout'
import PanGrid from './PanGrid'

/** On-screen color card for one product (the PNG version is drawn in cards.ts). */
export default function SwatchCard({ p }: { p: Product }) {
  const multi = isMulti(p)
  // split products (blush duo…) use the same 150px block as a single color, split into stripes
  const hex = p.swatches[0]?.hex
  return (
    <div className="swatch-card">
      {p.noColor ? (
        <div className="sc-photo">
          {p.imagePath ? <img src={p.imagePath} alt="" /> : <span>No picture yet</span>}
        </div>
      ) : multi ? (
        <PanGrid shape={p} className="sc-grid" style={isSplitProduct(p) ? { aspectRatio: 'auto', height: 150, gap: 2 } : undefined}>
          {i => {
            const s = p.swatches[i] ?? {}
            return (
              <div className="sc-pan" style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}>
                {s.hex && <FinishLayer finish={s.finish} />}
                {s.label && <span>{s.label}</span>}
              </div>
            )
          }}
        </PanGrid>
      ) : (
        <div className="sc-color" style={{ background: hex ?? undefined, color: isDark(hex) ? 'rgba(255,255,255,.85)' : 'rgba(42,35,33,.7)' }}>
          {hex && <FinishLayer finish={p.swatches[0]?.finish} />}
          <span>{hex ? hex.toUpperCase() : 'No color yet'}</span>
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
