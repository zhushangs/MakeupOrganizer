import type { Product } from '../types'

/** Mini palette grid shown in the list */
export default function PaletteGrid({ p }: { p: Product }) {
  return (
    <div className="pgrid" style={{ gridTemplateColumns: `repeat(${p.gridCols}, 1fr)` }}>
      {p.swatches.map((s, i) => (
        <div key={i} className="pcell" style={s.hex ? { background: s.hex } : undefined} />
      ))}
    </div>
  )
}
