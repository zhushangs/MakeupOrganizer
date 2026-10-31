import { useState } from 'react'
import { dominantColor, isDark } from '../color'
import type { Swatch } from '../types'
import ColorEditor from './ColorEditor'

export interface ColorValue {
  gridRows: number
  gridCols: number
  swatches: Swatch[]
}

export function resizeSwatches(sw: Swatch[], oldCols: number, rows: number, cols: number): Swatch[] {
  const out: Swatch[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push(c < oldCols ? (sw[r * oldCols + c] ?? {}) : {})
  return out
}

/** Grid size, pan cells, and the color editor (eyedropper on the product image + color picker). */
export default function ColorSection({ value, imagePath, onChange }: {
  value: ColorValue
  imagePath?: string | null
  onChange: (v: ColorValue) => void
}) {
  const [sel, setSel] = useState(0)
  const cells = value.gridRows * value.gridCols
  const multi = cells > 1
  const cur = Math.min(sel, cells - 1)

  const setGrid = (rows: number, cols: number) => {
    rows = Math.max(1, Math.min(10, rows)); cols = Math.max(1, Math.min(10, cols))
    onChange({ gridRows: rows, gridCols: cols, swatches: resizeSwatches(value.swatches, value.gridCols, rows, cols) })
    setSel(s => Math.min(s, rows * cols - 1))
  }
  const patchCell = (i: number, patch: Swatch) =>
    onChange({ ...value, swatches: value.swatches.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const images = imagePath ? [{ label: 'Product', src: imagePath }] : []

  return (
    <>
      <div className="grid-size">
        <span>Grid</span>
        <Stepper value={value.gridRows} onChange={v => setGrid(v, value.gridCols)} />
        <span>rows ×</span>
        <Stepper value={value.gridCols} onChange={v => setGrid(value.gridRows, v)} />
        <span>cols = {cells} {cells === 1 ? 'pan' : 'pans'}</span>
      </div>

      {multi && (
        <div className="edit-grid" style={{ gridTemplateColumns: `repeat(${value.gridCols}, 1fr)` }}>
          {value.swatches.map((s, i) => (
            <button key={i} type="button" className={'edit-cell' + (i === cur ? ' sel' : '')}
              style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}
              onClick={() => setSel(i)}>
              <span className="i">{i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {multi && (
        <div className="field"><label>Pan {cur + 1} name (optional)</label>
          <input className="input" value={value.swatches[cur]?.label ?? ''} placeholder="e.g. Buzz"
            onChange={e => patchCell(cur, { label: e.target.value })} /></div>
      )}

      <ColorEditor
        value={value.swatches[cur]?.hex}
        images={images}
        hint={multi ? `Tap pan ${cur + 1} on the image. It moves to the next pan automatically.` : 'Press and drag on the image, release to pick'}
        onChange={(hex, fromImage) => {
          patchCell(cur, { hex })
          if (fromImage && multi) setSel(Math.min(cur + 1, cells - 1))
        }}
      />
      {!multi && imagePath && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }}
          onClick={async () => { const c = await dominantColor(imagePath).catch(() => null); if (c) patchCell(0, { hex: c }) }}>
          Reset to auto-detected color
        </button>
      )}
    </>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 10} aria-label="Increase">+</button>
    </span>
  )
}
