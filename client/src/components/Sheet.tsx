import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Bottom sheet. Close it by tapping outside, pressing Escape, or (on a phone) swiping it down:
 * when the sheet is scrolled to the top, dragging down moves it with the finger, and letting go
 * far enough or fast enough closes it; otherwise it springs back.
 */
export default function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [])

  // swipe down to close (native listeners: touchmove must be non-passive to stop the content bouncing)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    let start: { y: number; t: number; canDrag: boolean } | null = null
    let dragging = false
    let dy = 0

    const setOffset = (y: number, animate: boolean) => {
      el.style.transition = animate ? 'transform .2s ease' : 'none'
      el.style.transform = y ? `translateY(${y}px)` : ''
      if (scrimRef.current) {
        scrimRef.current.style.transition = animate ? 'opacity .2s ease' : 'none'
        scrimRef.current.style.opacity = String(Math.max(0, 1 - y / 400))
      }
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { start = null; return }
      // only when the sheet is at its top; otherwise the swipe scrolls the sheet's content
      start = { y: e.touches[0].clientY, t: Date.now(), canDrag: el.scrollTop <= 0 }
      dragging = false
      dy = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start?.canDrag) return
      const d = e.touches[0].clientY - start.y
      if (!dragging) {
        if (d > 8) dragging = true
        else { if (d < -8) start.canDrag = false; return } // moving up: let the content scroll
      }
      e.preventDefault()
      dy = Math.max(0, d - 8)
      setOffset(dy, false)
    }
    const onEnd = () => {
      if (!dragging || !start) { start = null; return }
      const speed = dy / Math.max(1, Date.now() - start.t) // px per ms
      start = null
      dragging = false
      if (dy > 120 || (dy > 40 && speed > 0.5)) {
        setOffset(el.offsetHeight, true)
        window.setTimeout(() => closeRef.current(), 180)
      } else {
        setOffset(0, true)
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <>
      <div className="scrim" ref={scrimRef} onClick={onClose} />
      <div className="sheet" ref={sheetRef} role="dialog" aria-modal="true">
        <div className="grabber" />
        {children}
      </div>
    </>
  )
}
