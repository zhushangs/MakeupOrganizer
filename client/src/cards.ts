import { categoryOf, type Product } from './types'
import { isDark, loadImage } from './color'
import { isMulti, isSplitProduct, panRects } from './layout'

/** Color cards drawn on a canvas so they can be saved as PNG. */

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const BG = '#fbf7f3'
const INK = '#2a2321'
const INK2 = '#6f625c'
const INK3 = '#a3958e'
const EMPTY = '#e9e0d9'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

/** Draw the product's color(s) into a square/rect: one block, or the palette's pan grid */
function drawSwatch(ctx: CanvasRenderingContext2D, p: Product, x: number, y: number, w: number, h: number, r: number) {
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  if (!isMulti(p)) {
    ctx.fillStyle = p.swatches[0]?.hex ?? EMPTY
    ctx.fillRect(x, y, w, h)
  } else {
    const gap = Math.max(2, Math.round(w * 0.012))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, w, h)
    const cw = (w - gap * (p.gridCols - 1)) / p.gridCols
    const ch = (h - gap * (p.gridRows - 1)) / p.gridRows
    // pans can span several cells (layout); draw each pan over its whole area
    panRects(p).forEach((r, i) => {
      ctx.fillStyle = p.swatches[i]?.hex ?? EMPTY
      ctx.fillRect(x + r.c * (cw + gap), y + r.r * (ch + gap), r.cs * cw + (r.cs - 1) * gap, r.rs * ch + (r.rs - 1) * gap)
    })
  }
  ctx.restore()
  // hairline so very light colors still have an edge
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  ctx.strokeStyle = 'rgba(0,0,0,.08)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function toUrl(c: HTMLCanvasElement) {
  const url = c.toDataURL('image/png')
  // a canvas the browser couldn't allocate exports as an empty "data:," instead of throwing
  if (url.length < 100) throw new Error("Couldn't create the image on this device")
  return url
}

/** For products without a color card: the product photo, contained on white */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, r: number) {
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)
  if (img) {
    const pad = Math.min(w, h) * 0.06
    const scale = Math.min((w - pad * 2) / img.naturalWidth, (h - pad * 2) / img.naturalHeight)
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  } else {
    ctx.fillStyle = INK3
    ctx.font = `500 ${Math.round(w * 0.08)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('No color', x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
  }
  ctx.restore()
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  ctx.strokeStyle = 'rgba(0,0,0,.08)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/** Product photos for items without a color card (same-origin, so the canvas stays exportable) */
async function photos(items: Product[]) {
  const map = new Map<string, HTMLImageElement | null>()
  await Promise.all(items.filter(p => p.noColor && p.imagePath).map(async p => {
    map.set(p.id, await loadImage(p.imagePath!).catch(() => null))
  }))
  return map
}

/** One product's color card (portrait, Instagram-ish 4:5). Products without a color show their photo. */
export async function renderProductCard(p: Product): Promise<string> {
  const W = 1080, H = 1350, pad = 80
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  const multi = !p.noColor && isMulti(p)
  const sw = W - pad * 2
  // palettes keep their real proportions; single colors and split products fill the block
  const sh = multi && !isSplitProduct(p) ? Math.min(820, (sw / p.gridCols) * p.gridRows) : 820
  if (p.noColor) drawPhoto(ctx, (await photos([p])).get(p.id) ?? null, pad, pad, sw, sh, 36)
  else drawSwatch(ctx, p, pad, pad, sw, sh, 36)

  // hex on the swatch for single colors
  const hex = p.swatches[0]?.hex
  if (!p.noColor && !multi && hex) {
    ctx.font = `500 34px ${MONO}`
    ctx.fillStyle = isDark(hex) ? 'rgba(255,255,255,.85)' : 'rgba(42,35,33,.7)'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(hex.toUpperCase(), pad + 40, pad + sh - 40)
  }

  let y = pad + sh + 90
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK3
  ctx.font = `600 30px ${FONT}`
  ctx.letterSpacing = '4px'
  ctx.fillText(fit(ctx, (p.brand || categoryOf(p.category).label).toUpperCase(), sw), pad, y)
  ctx.letterSpacing = '0px'

  y += 76
  ctx.fillStyle = INK
  ctx.font = `700 64px ${FONT}`
  ctx.fillText(fit(ctx, p.shadeName || p.name, sw), pad, y)

  if (p.shadeName && p.name) {
    y += 58
    ctx.fillStyle = INK2
    ctx.font = `400 38px ${FONT}`
    ctx.fillText(fit(ctx, p.name, sw), pad, y)
  }

  ctx.fillStyle = INK3
  ctx.font = `500 26px ${FONT}`
  ctx.fillText(categoryOf(p.category).label, pad, H - pad + 10)
  ctx.textAlign = 'right'
  ctx.fillText('Vanity', W - pad, H - pad + 10)
  ctx.textAlign = 'left'
  return toUrl(c)
}

export interface ChartSection { label?: string; items: Product[] }

/** A piece of a section placed on one chart page (a long section can continue on the next page) */
export interface ChartBlock { label?: string; total: number; items: Product[] }

const W = 1200, PAD = 64, GAP = 28, TEXT_H = 84, HEAD_H = 150, SEC_HEAD = 92, SEC_GAP = 48
/**
 * iPhone Safari can't export a canvas over ~16.7M pixels (it comes out blank), so a long chart is split
 * into several images, each at most W × MAX_CHART_H (1200 × 12000 = 14.4M pixels).
 */
export const MAX_CHART_H = 12000

export function chartGrid(count: number) {
  const cols = count <= 4 ? Math.max(2, count) : count <= 12 ? 4 : 5
  const cell = (W - PAD * 2 - GAP * (cols - 1)) / cols
  return { cols, cell }
}

const blockHeight = (b: { label?: string; items: unknown[] }, cols: number, cell: number) => {
  const rows = Math.max(1, Math.ceil(b.items.length / cols))
  return (b.label ? SEC_HEAD : 0) + rows * (cell + TEXT_H) + (rows - 1) * GAP
}

export const pageHeight = (blocks: ChartBlock[], cols: number, cell: number) =>
  PAD + HEAD_H + blocks.reduce((sum, b) => sum + blockHeight(b, cols, cell), 0) + (blocks.length - 1) * SEC_GAP + PAD

/**
 * Lay the sections out on pages no taller than MAX_CHART_H. A section that doesn't fit on the current
 * page moves to the next one whole if it fits there; only a section taller than a full page is split.
 */
export function paginateChart(sections: ChartSection[], cols: number, cell: number): ChartBlock[][] {
  const rowH = cell + TEXT_H + GAP
  const avail = MAX_CHART_H - PAD - HEAD_H - PAD
  const rowsFitting = (space: number, labeled: boolean) => Math.floor((space - (labeled ? SEC_HEAD : 0) + GAP) / rowH)
  const pages: ChartBlock[][] = [[]]
  let used = 0
  for (const s of sections) {
    let rest = s.items
    let cont = false
    while (rest.length) {
      const page = pages[pages.length - 1]
      const sep = page.length ? SEC_GAP : 0
      const fit = rowsFitting(avail - used - sep, !!s.label)
      const needed = Math.ceil(rest.length / cols)
      if (page.length && (fit < 1 || (fit < needed && needed <= rowsFitting(avail, !!s.label)))) {
        pages.push([]); used = 0
        continue
      }
      const block: ChartBlock = {
        label: s.label && (cont ? `${s.label} (cont.)` : s.label),
        total: s.items.length,
        items: rest.slice(0, Math.max(1, fit) * cols),
      }
      used += sep + blockHeight(block, cols, cell)
      page.push(block)
      rest = rest.slice(block.items.length)
      cont = true
    }
  }
  return pages.filter(p => p.length)
}

/**
 * Color chart. One section for a single category; for "All", one section per category
 * (each with its own heading), so lipsticks, palettes etc. aren't mixed together.
 * Returns one image per page (usually just one; big collections get several).
 */
export async function renderChart(title: string, sections: ChartSection[]): Promise<string[]> {
  const all = sections.flatMap(s => s.items)
  const imgs = await photos(all)
  const { cols, cell } = chartGrid(all.length)
  const pages = paginateChart(sections, cols, cell)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const noun = all.some(p => p.noColor || isMulti(p)) ? 'item' : 'shade'

  return pages.map((blocks, n) => {
    const H = pageHeight(blocks, cols, cell)
    const c = document.createElement('canvas')
    c.width = W; c.height = Math.round(H)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error("Couldn't create the image on this device")
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = INK
    ctx.font = `700 60px ${FONT}`
    ctx.fillText(title, PAD, PAD + 60)
    ctx.fillStyle = INK3
    ctx.font = `500 28px ${FONT}`
    const part = pages.length > 1 ? ` · Part ${n + 1} of ${pages.length}` : ''
    ctx.fillText(`${all.length} ${noun}${all.length === 1 ? '' : 's'} · ${date}${part}`, PAD, PAD + 108)

    let top = PAD + HEAD_H
    for (const b of blocks) {
      const blockTop = top
      if (b.label) {
        ctx.fillStyle = INK
        ctx.font = `700 36px ${FONT}`
        ctx.fillText(b.label, PAD, top + 44)
        const labelW = ctx.measureText(b.label).width
        ctx.fillStyle = INK3
        ctx.font = `500 24px ${FONT}`
        ctx.fillText(String(b.total), PAD + labelW + 14, top + 44)
        ctx.fillStyle = '#e4d9d1'
        ctx.fillRect(PAD, top + 66, W - PAD * 2, 2)
        top += SEC_HEAD
      }
      b.items.forEach((p, i) => {
        const x = PAD + (i % cols) * (cell + GAP)
        const y = top + Math.floor(i / cols) * (cell + TEXT_H + GAP)
        if (p.noColor) drawPhoto(ctx, imgs.get(p.id) ?? null, x, y, cell, cell, 18)
        else {
          // every item fills its whole square, like the home cards (a wide palette would otherwise
          // be a short strip with empty space above it)
          drawSwatch(ctx, p, x, y, cell, cell, 18)
        }
        ctx.fillStyle = INK
        ctx.font = `600 ${cols >= 5 ? 22 : 25}px ${FONT}`
        ctx.fillText(fit(ctx, p.shadeName || p.name, cell), x, y + cell + 36)
        ctx.fillStyle = INK2
        ctx.font = `400 ${cols >= 5 ? 19 : 21}px ${FONT}`
        ctx.fillText(fit(ctx, p.brand, cell), x, y + cell + 66)
      })
      top = blockTop + blockHeight(b, cols, cell) + SEC_GAP
    }
    return toUrl(c)
  })
}
