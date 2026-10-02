import { useState } from 'react'
import { api } from '../api'
import { isDark } from '../color'
import { categoryOf, type Product } from '../types'
import Sheet from './Sheet'
import { go } from '../App'

export function formatPrice(price?: number | null, currency?: string | null) {
  if (price == null) return null
  const sym = !currency || currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency + ' '
  return sym + (Number.isInteger(price) ? price : price.toFixed(2))
}

export default function DetailSheet({ p, onClose, onDeleted }: {
  p: Product
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const multi = p.gridRows * p.gridCols > 1
  const hex = p.swatches[0]?.hex
  const price = formatPrice(p.price, p.currency)

  const del = async () => {
    if (!confirm) { setConfirm(true); return }
    setBusy(true)
    try { await api.remove(p.id); onDeleted() } finally { setBusy(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="d-hero">
        {p.imagePath
          ? <img className="d-img" src={p.imagePath} alt="" />
          : <div className="d-img" style={{ background: hex ?? undefined }} />}
        <div style={{ minWidth: 0 }}>
          <div className="d-brand">{p.brand || categoryOf(p.category).label}</div>
          <div className="d-name">{p.name}</div>
          {p.shadeName && (
            <div className="d-shade">{!multi && hex && <span className="dot" style={{ background: hex }} />}{p.shadeName}</div>
          )}
        </div>
      </div>

      {!multi && (
        <div className="d-big" style={{ background: hex ?? 'var(--empty-swatch)', color: isDark(hex) ? '#fff' : '#2a2321' }}>
          {hex ?? 'No color yet'}
        </div>
      )}

      {multi && (
        <div className="d-grid" style={{ gridTemplateColumns: `repeat(${p.gridCols}, 1fr)` }}>
          {p.swatches.map((s, i) => (
            <div key={i} className="d-cell" style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}>
              {s.label}
            </div>
          ))}
        </div>
      )}

      {(price || p.channel || p.sourceUrl || p.notes) && (
        <dl className="kv">
          {price && <><dt>Price</dt><dd>{price}</dd></>}
          {p.channel && <><dt>Bought at</dt><dd>{p.channel}</dd></>}
          {p.sourceUrl && <><dt>Link</dt><dd><a href={p.sourceUrl} target="_blank" rel="noreferrer">Open product page ↗</a></dd></>}
          {p.notes && <><dt>Notes</dt><dd>{p.notes}</dd></>}
        </dl>
      )}

      <div className="row">
        <button className={'btn danger' + (confirm ? ' confirm' : '')} onClick={del} disabled={busy}>
          {confirm ? 'Confirm delete' : 'Delete'}
        </button>
        <button className="btn primary" onClick={() => go(`/edit/${p.id}`)}>Edit / Adjust color</button>
      </div>
    </Sheet>
  )
}
