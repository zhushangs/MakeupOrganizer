/** How the pans are laid out in the real palette: quick presets plus rows × columns steppers. */

const PRESETS: [number, number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [2, 2], [2, 3], [1, 5], [2, 4], [3, 3], [2, 5], [2, 6], [3, 4], [4, 4], [3, 6],
]

export default function PaletteLayout({ rows, cols, onChange }: {
  rows: number
  cols: number
  onChange: (rows: number, cols: number) => void
}) {
  const set = (r: number, c: number) => onChange(Math.max(1, Math.min(10, r)), Math.max(1, Math.min(10, c)))
  return (
    <div className="layout">
      <div className="layout-presets">
        {PRESETS.map(([r, c]) => (
          <button key={`${r}x${c}`} type="button" title={`${r} × ${c}`}
            className={'preset' + (r === rows && c === cols ? ' on' : '')} onClick={() => set(r, c)}>
            <span className="preset-grid" style={{ gridTemplateColumns: `repeat(${c}, 1fr)` }}>
              {Array.from({ length: r * c }, (_, i) => <i key={i} />)}
            </span>
            <span className="preset-label">{r * c === 1 ? 'Single' : `${r}×${c}`}</span>
          </button>
        ))}
      </div>
      <div className="grid-size">
        <Stepper value={rows} onChange={v => set(v, cols)} />
        <span>rows ×</span>
        <Stepper value={cols} onChange={v => set(rows, v)} />
        <span>columns = {rows * cols} {rows * cols === 1 ? 'pan' : 'pans'}</span>
      </div>
    </div>
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
