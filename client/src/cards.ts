import { categoryOf, type Product } from './types'
import { isDark } from './color'

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
  const cells = p.gridRows * p.gridCols
  if (cells <= 1) {
    ctx.fillStyle = p.swatches[0]?.hex ?? EMPTY
    ctx.fillRect(x, y, w, h)
  } else {
    const gap = Math.max(2, Math.round(w * 0.012))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, w, h)
    const cw = (w - gap * (p.gridCols - 1)) / p.gridCols
    const ch = (h - gap * (p.gridRows - 1)) / p.gridRows
    p.swatches.forEach((s, i) => {
      const cx = x + (i % p.gridCols) * (cw + gap)
      const cy = y + Math.floor(i / p.gridCols) * (ch + gap)
      ctx.fillStyle = s.hex ?? EMPTY
      ctx.fillRect(cx, cy, cw, ch)
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
  return c.toDataURL('image/png')
}

/** One product's color card (portrait, Instagram-ish 4:5). */
export function renderProductCard(p: Product): string {
  const W = 1080, H = 1350, pad = 80
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  const multi = p.gridRows * p.gridCols > 1
  const sw = W - pad * 2
  const sh = multi ? Math.min(820, (sw / p.gridCols) * p.gridRows) : 820
  drawSwatch(ctx, p, pad, pad, sw, sh, 36)

  // hex on the swatch for single colors
  const hex = p.swatches[0]?.hex
  if (!multi && hex) {
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

/** All products of a category on one chart. */
export function renderChart(title: string, items: Product[]): string {
  const W = 1200, pad = 64
  const cols = items.length <= 4 ? Math.max(2, items.length) : items.length <= 12 ? 4 : 5
  const gap = 28
  const cell = (W - pad * 2 - gap * (cols - 1)) / cols
  const textH = 84
  const rows = Math.max(1, Math.ceil(items.length / cols))
  const headH = 150
  const H = pad + headH + rows * (cell + textH) + (rows - 1) * gap + pad

  const c = document.createElement('canvas')
  c.width = W; c.height = Math.round(H)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  ctx.font = `700 60px ${FONT}`
  ctx.fillText(title, pad, pad + 60)
  ctx.fillStyle = INK3
  ctx.font = `500 28px ${FONT}`
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  ctx.fillText(`${items.length} ${items.length === 1 ? 'shade' : 'shades'} · ${date}`, pad, pad + 108)

  items.forEach((p, i) => {
    const x = pad + (i % cols) * (cell + gap)
    const y = pad + headH + Math.floor(i / cols) * (cell + textH + gap)
    const multi = p.gridRows * p.gridCols > 1
    const h = multi ? Math.min(cell, (cell / p.gridCols) * p.gridRows) : cell
    drawSwatch(ctx, p, x, y + (cell - h), cell, h, 18)
    ctx.fillStyle = INK
    ctx.font = `600 ${cols >= 5 ? 22 : 25}px ${FONT}`
    ctx.fillText(fit(ctx, p.shadeName || p.name, cell), x, y + cell + 36)
    ctx.fillStyle = INK2
    ctx.font = `400 ${cols >= 5 ? 19 : 21}px ${FONT}`
    ctx.fillText(fit(ctx, p.brand, cell), x, y + cell + 66)
  })

  return toUrl(c)
}
