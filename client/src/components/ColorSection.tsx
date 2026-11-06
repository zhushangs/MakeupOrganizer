import FinishLayer from './FinishLayer'
import { FINISHES, FINISH_LABELS, finishOf } from '../finish'
import { useState } from 'react'
import { dominantColor, isDark } from '../color'
import type { Swatch } from '../types'
import { isMulti, isSplitShape, panCount, reshapeSwatches, SPLIT_SHAPES, type Shape } from '../layout'
import PanGrid from './PanGrid'
import ColorEditor from './ColorEditor'
import PaletteLayout from './PaletteLayout'

export interface ColorValue extends Shape {
  swatches: Swatch[]
  noColor?: boolean
}

/** Grid size, pan cells, and the color editor (eyedropper on the product image + color picker). */
export default function ColorSection({ value, imagePath, showLayout, onChange }: {
  value: ColorValue
  imagePath?: string | null
  /**
   * palette category (eyeshadow etc.): show the full palette layout picker. Otherwise (blush, lipstick…)
   * show the small picker for 1–3 colors side by side or top & bottom.
   */
  showLayout?: boolean
  onChange: (v: ColorValue) => void
}) {
  const [sel, setSel] = useState(0)
  const cells = panCount(value)
  const multi = isMulti(value)
  const cur = Math.min(sel, cells - 1)
  // non-palette product: colors are stripes of one square block, and are called "colors", not "pans"
  const split = !showLayout
  const unit = split ? 'Color' : 'Pan'

  const setShape = (shape: Shape) => {
    onChange({ ...shape, layout: shape.layout ?? null, swatches: reshapeSwatches(value, value.swatches, shape) })
    setSel(0)
  }
  const patchCell = (i: number, patch: Swatch) =>
    onChange({ ...value, swatches: value.swatches.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const images = imagePath ? [{ label: 'Product', src: imagePath }] : []

  const noColorToggle = (
    <label className="check small no-color">
      <input type="checkbox" checked={!!value.noColor} onChange={e => onChange({ ...value, noColor: e.target.checked })} />
      No color card (clear / colorless product) — show the product picture instead
    </label>
  )
  if (value.noColor) return noColorToggle

  return (
    <>
      {noColorToggle}
      {split && !(multi && !isSplitShape(value))
        ? <SplitPicker value={value} onChange={setShape} />
        // palettes, and older non-palette items with a custom palette shape
        : (showLayout || multi) && <PaletteLayout value={value} onChange={setShape} />}

      {multi && (
        <PanGrid shape={value} className="edit-grid" style={split ? { aspectRatio: '1', maxWidth: 220 } : undefined}>
          {i => {
            const s = value.swatches[i] ?? {}
            return (
              <button type="button" className={'edit-cell' + (i === cur ? ' sel' : '')}
                style={{ background: s.hex ?? undefined, color: isDark(s.hex) ? '#fff' : '#2a2321' }}
                onClick={() => setSel(i)}>
                {s.hex && <FinishLayer finish={s.finish} />}
                <span className="i">{i + 1}</span>
              </button>
            )
          }}
        </PanGrid>
      )}

      {multi && (
        <div className="field"><label>{unit} {cur + 1} name (optional)</label>
          <input className="input" value={value.swatches[cur]?.label ?? ''} placeholder={split ? 'e.g. Highlight' : 'e.g. Buzz'}
            onChange={e => patchCell(cur, { label: e.target.value })} /></div>
      )}

      <ColorEditor
        value={value.swatches[cur]?.hex}
        finish={value.swatches[cur]?.finish}
        images={images}
        hint={multi ? `Tap ${unit.toLowerCase()} ${cur + 1} on the picture (left → right, top → bottom, same as above). It moves to the next one automatically.` : 'Press and drag on the image, release to pick'}
        onChange={(hex, fromImage) => {
          patchCell(cur, { hex })
          if (fromImage && multi) setSel(Math.min(cur + 1, cells - 1))
        }}
      />
      <div className="field">
        <label>{multi ? `${unit} ${cur + 1} finish` : 'Finish'}</label>
        <div className="seg finish-seg">
          {FINISHES.map(f => (
            <button key={f} type="button" className={finishOf(value.swatches[cur]?.finish) === f ? 'on' : ''}
              onClick={() => patchCell(cur, { finish: f === 'matte' ? null : f })}>{FINISH_LABELS[f]}</button>
          ))}
        </div>
      </div>

      {!multi && imagePath && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }}
          onClick={async () => { const c = await dominantColor(imagePath).catch(() => null); if (c) patchCell(0, { hex: c }) }}>
          Reset to auto-detected color
        </button>
      )}
    </>
  )
}

/** For non-palette products: one color, or 2–4 colors side by side / top & bottom / in quarters */
function SplitPicker({ value, onChange }: { value: Shape; onChange: (s: Shape) => void }) {
  return (
    <div className="field">
      <label>Colors</label>
      <div className="layout-presets">
        {SPLIT_SHAPES.map(({ shape, label }) => (
          <button key={label} type="button" title={label}
            className={'preset' + (shape.gridRows === value.gridRows && shape.gridCols === value.gridCols && !value.layout ? ' on' : '')}
            onClick={() => onChange(shape)}>
            <PanGrid shape={shape} className="preset-grid split" style={{ aspectRatio: '1' }}>{() => <i />}</PanGrid>
            <span className="preset-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
