import FinishLayer from './FinishLayer'
import type { Product } from '../types'
import PanGrid from './PanGrid'

/** Mini palette shown on home cards and thumbnails */
export default function PaletteGrid({ p }: { p: Product }) {
  return (
    <PanGrid shape={p} className="pgrid">
      {i => (
        <div className="pcell" style={p.swatches[i]?.hex ? { background: p.swatches[i].hex! } : undefined}>
          {p.swatches[i]?.hex && <FinishLayer finish={p.swatches[i].finish} />}
        </div>
      )}
    </PanGrid>
  )
}
