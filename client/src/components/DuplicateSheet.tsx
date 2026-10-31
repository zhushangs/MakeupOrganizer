import type { Product } from '../types'
import Sheet from './Sheet'

/** "You already have this" prompt with a way to jump to the existing item */
export default function DuplicateSheet({ existing, onView, onAddAnyway, onClose }: {
  existing: Product
  onView: () => void
  onAddAnyway: () => void
  onClose: () => void
}) {
  const hex = existing.swatches[0]?.hex
  return (
    <Sheet onClose={onClose}>
      <h3 className="dup-title">You already have this</h3>
      <div className="dup-item">
        {existing.imagePath
          ? <img src={existing.imagePath} alt="" />
          : <span className="dup-swatch" style={{ background: hex ?? undefined }} />}
        <div>
          <div className="ic-brand">{existing.brand}</div>
          <div className="ic-shade">{existing.shadeName || existing.name}</div>
          {existing.shadeName && <div className="ic-name">{existing.name}</div>}
        </div>
      </div>
      <button className="btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={onView}>Go to it</button>
      <div className="row">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={onAddAnyway}>Add anyway</button>
      </div>
    </Sheet>
  )
}
