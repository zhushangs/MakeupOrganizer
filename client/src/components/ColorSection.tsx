import { useState } from 'react'
import { dominantColor, isDark } from '../color'
import type { Swatch } from '../types'
import { isMulti, panCount, reshapeSwatches, type Shape } from '../layout'
import PanGrid from './PanGrid'
import ColorEditor from './ColorEditor'
import PaletteLayout from './PaletteLayout'

export interface ColorValue extends Shape {
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
export default function ColorSection({ value, imagePath, showLayout, onChange }: {
  value: ColorValue
  imagePath?: string | null
  /** show the palette layout picker (eyeshadow etc.); always shown once there's more than one pan */
  showLayout?: boolean
  onChange: (v: ColorValue) => void
}) {
  const [sel, setSel] = useState(0)
  const cells = panCount(value)
  const multi = isMulti(value)
  const cur = Math.min(sel, cells - 1)

  const setShape = (shape: Shape) => {
    onChange({ ...shape, layout: shape.layout ?? null, swatches: reshapeSwatches(value, value.swatches, shape) })
    setSel(0)
  }
  const patchCell = (i: number, patch: Swatch) =>
    onChange({ ...value, swatches: value.swatches.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const images = imagePath ? [{ label: 'Product', src: imagePath }] : []

  return (
    <>
      {(showLayout || multi) && <PaletteLayout value={value} onChange={setShape} />}

      {multi && (
        <PanGrid shape={value} className="edit-grid">
          {i => {
            const s = value.swatches[i] ?? {}
            return (
              <button type="button" className={'edit-cell' + (i === cur ? ' sel' : '')}
                style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}
                onClick={() => setSel(i)}>
                <span className="i">{i + 1}</span>
              </button>
            )
          }}
        </PanGrid>
      )}

      {multi && (
        <div className="field"><label>Pan {cur + 1} name (optional)</label>
          <input className="input" value={value.swatches[cur]?.label ?? ''} placeholder="e.g. Buzz"
            onChange={e => patchCell(cur, { label: e.target.value })} /></div>
      )}

      <ColorEditor
        value={value.swatches[cur]?.hex}
        images={images}
        hint={multi ? `Tap pan ${cur + 1} on the picture (left → right, top → bottom, same as the grid above). It moves to the next pan automatically.` : 'Press and drag on the image, release to pick'}
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
