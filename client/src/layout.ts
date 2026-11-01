import { categoryOf, type Swatch } from './types'

/**
 * Palette shapes. A palette is a rows × cols grid of cells; `layout` (optional) says which pan each
 * cell belongs to, so one pan can span several cells (e.g. Chanel Les Beiges: 2 + 2 + one wide pan
 * at the bottom = 3 × 2 grid with layout [0,1, 2,3, 4,4]). No layout = every cell is its own pan.
 * Pans are numbered in reading order (left → right, top → bottom by their top-left cell),
 * and `swatches[i]` is the color of pan i.
 */
export interface Shape {
  gridRows: number
  gridCols: number
  layout?: number[] | null
}

export interface PanRect { r: number; c: number; rs: number; cs: number }

export function cellMap(s: Shape): number[] {
  const n = s.gridRows * s.gridCols
  return s.layout && s.layout.length === n ? s.layout : Array.from({ length: n }, (_, i) => i)
}

export const panCount = (s: Shape) => Math.max(...cellMap(s)) + 1
export const isMulti = (s: Shape) => panCount(s) > 1

/**
 * Split products: one product with 2–4 colors side by side, top & bottom or in quarters (a blush duo, a contour quad, a striped
 * highlighter), in a category that isn't a palette. They're drawn as one square split into stripes,
 * not as a row of square pans like an eyeshadow palette.
 */
export const SPLIT_SHAPES: { shape: Shape; label: string }[] = [
  { shape: { gridRows: 1, gridCols: 1, layout: null }, label: 'One color' },
  { shape: { gridRows: 1, gridCols: 2, layout: null }, label: 'Left · right' },
  { shape: { gridRows: 2, gridCols: 1, layout: null }, label: 'Top · bottom' },
  { shape: { gridRows: 1, gridCols: 3, layout: null }, label: '3 across' },
  { shape: { gridRows: 3, gridCols: 1, layout: null }, label: '3 stacked' },
  { shape: { gridRows: 2, gridCols: 2, layout: null }, label: '4 squares' },
  { shape: { gridRows: 1, gridCols: 4, layout: null }, label: '4 across' },
  { shape: { gridRows: 4, gridCols: 1, layout: null }, label: '4 stacked' },
]
export const isSplitShape = (s: Shape) =>
  !s.layout && SPLIT_SHAPES.some(x => x.shape.gridRows === s.gridRows && x.shape.gridCols === s.gridCols)
/** A multi-color item in a non-palette category: show it as one square block */
export const isSplitProduct = (p: Shape & { category: string }) => isMulti(p) && !categoryOf(p.category).multi

export function panRects(s: Shape): PanRect[] {
  const map = cellMap(s)
  const rects: PanRect[] = []
  map.forEach((pan, i) => {
    const r = Math.floor(i / s.gridCols), c = i % s.gridCols
    const cur = rects[pan]
    if (!cur) rects[pan] = { r, c, rs: 1, cs: 1 }
    else {
      const r1 = Math.max(cur.r + cur.rs, r + 1), c1 = Math.max(cur.c + cur.cs, c + 1)
      cur.r = Math.min(cur.r, r); cur.c = Math.min(cur.c, c)
      cur.rs = r1 - cur.r; cur.cs = c1 - cur.c
    }
  })
  return rects
}

/** Renumber pans in reading order; null when every cell is its own pan */
export function normalizeLayout(rows: number, cols: number, map: number[]): number[] | null {
  const order = new Map<number, number>()
  const out = map.map(p => {
    if (!order.has(p)) order.set(p, order.size)
    return order.get(p)!
  })
  return out.every((p, i) => p === i) && out.length === rows * cols ? null : out
}

/** Merge the selected cells into one pan. They must make up a rectangle without cutting other pans. */
export function mergeCells(s: Shape, cells: number[]): number[] | null | string {
  if (cells.length < 2) return 'Select at least two cells'
  const map = [...cellMap(s)]
  // include every cell of pans that are touched, then check the result is a full rectangle
  const pans = new Set(cells.map(i => map[i]))
  const all = map.map((p, i) => (pans.has(p) ? i : -1)).filter(i => i >= 0)
  const rs = all.map(i => Math.floor(i / s.gridCols)), cs = all.map(i => i % s.gridCols)
  const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs)
  if ((r1 - r0 + 1) * (c1 - c0 + 1) !== all.length) return 'Merged pans must form a rectangle'
  const target = map[all[0]]
  for (const i of all) map[i] = target
  return normalizeLayout(s.gridRows, s.gridCols, map)
}

/** Split one pan back into single cells */
export function splitPan(s: Shape, pan: number): number[] | null {
  const map = [...cellMap(s)]
  let next = Math.max(...map) + 1
  let first = true
  map.forEach((p, i) => {
    if (p !== pan) return
    if (first) first = false
    else map[i] = next++
  })
  return normalizeLayout(s.gridRows, s.gridCols, map)
}

/** Keep colors when the shape changes: each new pan takes the color found at its top-left cell before */
export function reshapeSwatches(from: Shape, swatches: Swatch[], to: Shape): Swatch[] {
  const oldMap = cellMap(from)
  return panRects(to).map(({ r, c }) => {
    if (r >= from.gridRows || c >= from.gridCols) return {}
    return { ...(swatches[oldMap[r * from.gridCols + c]] ?? {}) }
  })
}

/** CSS grid placement for a pan */
export const panStyle = (p: PanRect) => ({ gridRow: `${p.r + 1} / span ${p.rs}`, gridColumn: `${p.c + 1} / span ${p.cs}` })

/** CSS for the grid container: square cells */
export const gridStyle = (s: Shape) => ({
  gridTemplateColumns: `repeat(${s.gridCols}, 1fr)`,
  gridTemplateRows: `repeat(${s.gridRows}, 1fr)`,
  aspectRatio: `${s.gridCols} / ${s.gridRows}`,
})
