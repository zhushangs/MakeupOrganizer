import { useState } from 'react'
import { MAX_GRID, cellMap, mergeCells, normalizeLayout, panCount, panRects, splitPan, type Shape } from '../layout'
import PanGrid from './PanGrid'

/**
 * How the pans sit in the real palette: quick presets (including uneven ones like 2 + 2 + one wide pan),
 * rows × columns steppers, and a "customize" editor to merge cells into bigger pans.
 */

const g = (gridRows: number, gridCols: number, layout: number[] | null = null): Shape => ({ gridRows, gridCols, layout })

const PRESETS: { shape: Shape; label: string }[] = [
  { shape: g(1, 1), label: 'Single' },
  { shape: g(1, 2), label: '1×2' },
  { shape: g(1, 3), label: '1×3' },
  { shape: g(1, 4), label: '1×4' },
  { shape: g(2, 2), label: '2×2' },
  { shape: g(3, 2, [0, 1, 2, 3, 4, 4]), label: '2+2+1' },
  { shape: g(2, 2, [0, 1, 2, 2]), label: '2+1' },
  { shape: g(2, 2, [0, 0, 1, 2]), label: '1+2' },
  { shape: g(2, 2, [0, 1, 0, 2]), label: 'Big+2' },
  { shape: g(2, 3, [0, 1, 2, 0, 3, 4]), label: 'Big+4' },
  { shape: g(2, 3), label: '2×3' },
  { shape: g(1, 5), label: '1×5' },
  { shape: g(2, 4), label: '2×4' },
  { shape: g(3, 3), label: '3×3' },
  { shape: g(2, 5), label: '2×5' },
  { shape: g(2, 6), label: '2×6' },
  { shape: g(3, 4), label: '3×4' },
  { shape: g(4, 4), label: '4×4' },
  { shape: g(3, 6), label: '3×6' },
]

const sameShape = (a: Shape, b: Shape) =>
  a.gridRows === b.gridRows && a.gridCols === b.gridCols &&
  JSON.stringify(normalizeLayout(a.gridRows, a.gridCols, cellMap(a))) === JSON.stringify(normalizeLayout(b.gridRows, b.gridCols, cellMap(b)))

export default function PaletteLayout({ value, onChange, allowCustom = true }: {
  value: Shape
  onChange: (s: Shape) => void
  /** false: plain rows × columns only (e.g. a category's default layout) */
  allowCustom?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const setGrid = (r: number, c: number) => {
    setSelected([]); setMsg(null)
    onChange(g(Math.max(1, Math.min(MAX_GRID, r)), Math.max(1, Math.min(MAX_GRID, c))))
  }
  const pans = panCount(value)
  const merged = panRects(value).map(p => p.rs * p.cs > 1)
  const presets = allowCustom ? PRESETS : PRESETS.filter(p => !p.shape.layout)

  const merge = () => {
    const map = cellMap(value)
    const cells = map.map((p, i) => (selected.includes(p) ? i : -1)).filter(i => i >= 0)
    const res = mergeCells(value, cells)
    if (typeof res === 'string') { setMsg(res); return }
    setMsg(null); setSelected([])
    onChange({ ...value, layout: res })
  }
  const split = () => {
    setSelected([]); setMsg(null)
    onChange({ ...value, layout: splitPan(value, selected[0]) })
  }

  return (
    <div className="layout">
      <div className="layout-presets">
        {presets.map(({ shape, label }) => (
          <button key={label} type="button" title={label}
            className={'preset' + (sameShape(shape, value) ? ' on' : '')}
            onClick={() => { setSelected([]); setMsg(null); onChange(shape) }}>
            <PanGrid shape={shape} className="preset-grid">{() => <i />}</PanGrid>
            <span className="preset-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid-size">
        <Stepper value={value.gridRows} onChange={v => setGrid(v, value.gridCols)} />
        <span>rows ×</span>
        <Stepper value={value.gridCols} onChange={v => setGrid(value.gridRows, v)} />
        <span>columns = {pans} {pans === 1 ? 'pan' : 'pans'}</span>
      </div>

      {allowCustom && value.gridRows * value.gridCols > 1 && (
        <button type="button" className="link-btn small" style={{ alignSelf: 'flex-start' }}
          onClick={() => { setEditing(!editing); setSelected([]); setMsg(null) }}>
          {editing ? 'Done customizing ▴' : 'Pans different sizes? Customize the shape ▾'}
        </button>
      )}

      {allowCustom && editing && (
        <div className="layout-editor">
          <div className="hint">Tap the cells that belong to one bigger pan, then Merge. Select a merged pan and Split to undo.</div>
          <PanGrid shape={value}>
            {i => (
              <button type="button"
                className={'le-cell' + (selected.includes(i) ? ' sel' : '') + (merged[i] ? ' merged' : '')}
                onClick={() => setSelected(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i]))}>
                {i + 1}
              </button>
            )}
          </PanGrid>
          <div className="row" style={{ maxWidth: 280 }}>
            <button type="button" className="btn small" disabled={selected.length < 2} onClick={merge}>Merge</button>
            <button type="button" className="btn small" disabled={selected.length !== 1 || !merged[selected[0]]} onClick={split}>Split</button>
          </div>
          {msg && <div className="err">{msg}</div>}
        </div>
      )}
    </div>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= MAX_GRID} aria-label="Increase">+</button>
    </span>
  )
}
