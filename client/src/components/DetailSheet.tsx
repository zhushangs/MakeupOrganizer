import { useEffect, useRef, useState, type TouchEvent } from 'react'
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

/** Where this item sits in the list it was opened from, for swiping to the previous/next one */
export interface DetailNav {
  index: number
  total: number
  onPrev?: () => void
  onNext?: () => void
}

export default function DetailSheet({ p, onClose, onDeleted, nav }: {
  p: Product
  onClose: () => void
  onDeleted: () => void
  nav?: DetailNav
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const orig = formatPrice(p.originalPrice, p.currency)
  const paid = formatPrice(p.paidPrice, p.currency)
  const saved = p.originalPrice && p.paidPrice != null && p.paidPrice < p.originalPrice
    ? Math.round((1 - p.paidPrice / p.originalPrice) * 100) : null

  // Swipe left/right to the next/previous item in the list (the sheet itself stays open)
  const paneRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null)
  const [dir, setDir] = useState<'from-right' | 'from-left' | null>(null)
  const goPrev = () => { if (nav?.onPrev) { setDir('from-left'); nav.onPrev() } }
  const goNext = () => { if (nav?.onNext) { setDir('from-right'); nav.onNext() } }
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s || !nav) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Date.now() - s.t > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) goNext(); else goPrev()
  }
  // a different item: start fresh (no half-confirmed delete, old error) and back at the top
  useEffect(() => {
    setConfirm(false); setError(null)
    paneRef.current?.closest('.sheet')?.scrollTo({ top: 0 })
  }, [p.id])

  const del = async () => {
    if (!confirm) { setConfirm(true); return }
    setBusy(true); setError(null)
    try {
      await api.remove(p.id)
      onDeleted()
    } catch (e) {
      setError((e as Error).message || "Couldn't delete this item")
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  const makeCard = async () => {
    setMaking(true); setError(null)
    try { setCard(await renderProductCard(p)) }
    catch (e) { setError((e as Error).message || "Couldn't make the card") }
    finally { setMaking(false) }
  }

  if (card)
    return <SaveImageOverlay src={card} fileName={`${[p.brand, p.shadeName || p.name].filter(Boolean).join('-').replace(/\s+/g, '-')}.png`}
      onClose={() => setCard(null)} />

  return (
    <Sheet onClose={onClose}>
      <div ref={paneRef} key={p.id} className={'d-pane' + (dir ? ' ' + dir : '')}
        onAnimationEnd={() => setDir(null)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {nav && nav.total > 1 && (
        <div className="d-nav">
          <button type="button" aria-label="Previous item" disabled={!nav.onPrev} onClick={goPrev}>‹</button>
          <span>{nav.index + 1} / {nav.total}</span>
          <button type="button" aria-label="Next item" disabled={!nav.onNext} onClick={goNext}>›</button>
        </div>
      )}
      {/* without a color card the card itself shows the photo, so don't repeat it */}
      {p.imagePath && !p.noColor && <img className="d-photo" src={p.imagePath} alt="" />}
      <SwatchCard p={p} />

      {(p.channel || orig || paid || p.notes) && (
        <dl className="kv">
          {p.channel && <><dt>Bought at</dt><dd>{p.channel}</dd></>}
          {orig && <><dt>Original</dt><dd>{orig}</dd></>}
          {paid && <><dt>Paid</dt><dd>{paid}{saved ? <span className="saved"> {saved}% off</span> : null}</dd></>}
          {p.notes && <><dt>Notes</dt><dd className="notes">{p.notes}</dd></>}
        </dl>
      )}

      {!p.imagePath && (
        <button className="btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => go(`/image/${p.id}`)}>
          {p.noColor ? 'Find a picture' : <>Find a picture &amp; make the color card</>}
        </button>
      )}
      <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={makeCard} disabled={making}>
        {making ? <span className="spinner" /> : p.noColor ? 'Save card as image' : 'Save color card as image'}
      </button>
      {error && <div className="err" style={{ textAlign: 'center', marginBottom: 10 }}>{error}</div>}
      <div className="row">
        <button className={'btn danger' + (confirm ? ' confirm' : '')} onClick={del} disabled={busy}>
          {confirm ? 'Confirm delete' : 'Delete'}
        </button>
        <button className="btn primary" onClick={() => go(`/edit/${p.id}`)}>Edit</button>
      </div>
      </div>
    </Sheet>
  )
}
