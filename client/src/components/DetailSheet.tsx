import { useState } from 'react'
import { api } from '../api'
import { renderProductCard } from '../cards'
import type { Product } from '../types'
import Sheet from './Sheet'
import SwatchCard from './SwatchCard'
import SaveImageOverlay from './SaveImageOverlay'
import { go } from '../App'

export function formatPrice(price?: number | null, currency?: string | null) {
  if (price == null) return null
  const sym = !currency || currency === 'USD' || currency === 'CAD' ? '$' : currency === 'CNY' || currency === 'JPY' ? '¥'
    : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'KRW' ? '₩' : currency + ' '
  return sym + (Number.isInteger(price) ? price : price.toFixed(2))
}

export default function DetailSheet({ p, onClose, onDeleted }: {
  p: Product
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<string | null>(null)
  const orig = formatPrice(p.originalPrice, p.currency)
  const paid = formatPrice(p.paidPrice, p.currency)
  const saved = p.originalPrice && p.paidPrice != null && p.paidPrice < p.originalPrice
    ? Math.round((1 - p.paidPrice / p.originalPrice) * 100) : null

  const del = async () => {
    if (!confirm) { setConfirm(true); return }
    setBusy(true)
    try { await api.remove(p.id); onDeleted() } finally { setBusy(false) }
  }

  if (card)
    return <SaveImageOverlay src={card} fileName={`${[p.brand, p.shadeName || p.name].filter(Boolean).join('-').replace(/\s+/g, '-')}.png`}
      onClose={() => setCard(null)} />

  return (
    <Sheet onClose={onClose}>
      {p.imagePath && <img className="d-photo" src={p.imagePath} alt="" />}
      <SwatchCard p={p} />

      {(p.channel || orig || paid || p.notes) && (
        <dl className="kv">
          {p.channel && <><dt>Bought at</dt><dd>{p.channel}</dd></>}
          {orig && <><dt>Original</dt><dd>{orig}</dd></>}
          {paid && <><dt>Paid</dt><dd>{paid}{saved ? <span className="saved"> {saved}% off</span> : null}</dd></>}
          {p.notes && <><dt>Notes</dt><dd className="notes">{p.notes}</dd></>}
        </dl>
      )}

      <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={() => setCard(renderProductCard(p))}>
        Save color card as image
      </button>
      <div className="row">
        <button className={'btn danger' + (confirm ? ' confirm' : '')} onClick={del} disabled={busy}>
          {confirm ? 'Confirm delete' : 'Delete'}
        </button>
        <button className="btn primary" onClick={() => go(`/edit/${p.id}`)}>Edit</button>
      </div>
    </Sheet>
  )
}
