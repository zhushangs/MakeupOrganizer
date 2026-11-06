import FinishLayer from './FinishLayer'
import type { Finish } from '../finish'
import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { hexToRgb, loadImage, sampleAt } from '../color'

interface Props {
  value: string | null | undefined
  /** fromImage = true means the color came from the eyedropper (for palettes the parent advances to the next pan) */
  onChange: (hex: string, fromImage: boolean) => void
  images: { label: string; src: string }[]
  hint?: string
  /** finish of this color, shown on the little preview dot */
  finish?: Finish | null
}

export default function ColorEditor({ value, onChange, images, hint, finish }: Props) {
  const [mode, setMode] = useState<'picker' | 'dropper'>(images.length ? 'dropper' : 'picker')
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])

  useEffect(() => { if (!images.length && mode === 'dropper') setMode('picker') }, [images.length, mode])

  return (
    <div className="picker-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="seg">
          <button type="button" className={mode === 'dropper' ? 'on' : ''} disabled={!images.length}
            onClick={() => setMode('dropper')}>Pick from image</button>
          <button type="button" className={mode === 'picker' ? 'on' : ''} onClick={() => setMode('picker')}>Color picker</button>
        </div>
      </div>

      {mode === 'dropper' && images.length > 0 && <Dropper images={images} onPick={hex => onChange(hex, true)} />}
      {mode === 'dropper' && hint && <div className="hint">{hint}</div>}
      {mode === 'picker' && <HexColorPicker color={value ?? '#c0566a'} onChange={hex => onChange(hex, false)} />}

      <div className="hex-row">
        <span className="dot" style={{ background: value ?? 'var(--empty-swatch)' }}>{value && <FinishLayer finish={finish} />}</span>
        <input className="input" value={text} placeholder="#c0566a" maxLength={7} inputMode="text"
          onChange={e => {
            let v = e.target.value.trim()
            if (v && !v.startsWith('#')) v = '#' + v
            setText(v)
            if (hexToRgb(v)) onChange(v.toLowerCase(), false)
          }} />
      </div>
    </div>
  )
}

function Dropper({ images, onPick }: { images: { label: string; src: string }[]; onPick: (hex: string) => void }) {
  const [idx, setIdx] = useState(0)
  const src = images[Math.min(idx, images.length - 1)].src
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [loupe, setLoupe] = useState<{ x: number; y: number; hex: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setErr(null)
    loadImage(src).then(img => {
      if (!alive || !canvasRef.current) return
      const c = canvasRef.current
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight))
      c.width = Math.round(img.naturalWidth * scale)
      c.height = Math.round(img.naturalHeight * scale)
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
    }).catch(() => alive && setErr("Couldn't load this picture. Use the color picker, or choose a different picture."))
    return () => { alive = false }
  }, [src])

  const sample = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return null
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const hex = sampleAt(ctx, (cx / rect.width) * c.width, (cy / rect.height) * c.height, 2)
    return { x: cx, y: cy, hex }
  }

  return (
    <div>
      {images.length > 1 && (
        <div className="seg" style={{ marginBottom: 8 }}>
          {images.map((im, i) => (
            <button type="button" key={im.src} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)}>{im.label}</button>
          ))}
        </div>
      )}
      <div className="dropper" ref={wrapRef}
        onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); setLoupe(sample(e)) }}
        onPointerMove={e => { if (loupe) { const s = sample(e); if (s) setLoupe(s) } }}
        onPointerUp={e => { const s = sample(e) ?? loupe; setLoupe(null); if (s) onPick(s.hex) }}
        onPointerCancel={() => setLoupe(null)}>
        <canvas ref={canvasRef} />
        {loupe && <div className="loupe" style={{ left: loupe.x, top: loupe.y, background: loupe.hex }} />}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
