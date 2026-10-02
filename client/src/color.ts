export type RGB = [number, number, number]

export const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** Hue sort key: pink → red → orange → brown → …, grays/black/white last */
export function hueSortKey(hex?: string | null): number {
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb) return 99999
  const [h, s, l] = rgbToHsl(rgb)
  if (s < 0.1) return 10000 + (1 - l) * 100
  return ((h + 40) % 360) * 10 + (1 - l)
}

/** Whether to use light text on this background color */
export function isDark(hex?: string | null) {
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb) return false
  const [r, g, b] = rgb.map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Failed to load image'))
    img.src = src
  })
}

function pixels(img: HTMLImageElement, size = 80) {
  const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, w, h }
}

/** Swatch image: average color of the center region (ignoring white borders) */
export async function swatchColor(src: string): Promise<string | null> {
  const img = await loadImage(src)
  const { data, w, h } = pixels(img, 60)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = Math.floor(h * 0.2); y < Math.ceil(h * 0.8); y++)
    for (let x = Math.floor(w * 0.2); x < Math.ceil(w * 0.8); x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 200) continue
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) continue
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
    }
  return n ? toHex([r / n, g / n, b / n]) : null
}

/**
 * Product image: find the color most likely to be the shade.
 * Buckets pixels by color, skips white background, pure black and transparency, and favors saturated buckets
 * (packaging is usually black/gold/silver; the product itself is usually more saturated).
 * It's only a starting value; the user can fix it with the eyedropper or color picker.
 */
export async function dominantColor(src: string): Promise<string | null> {
  const img = await loadImage(src)
  const { data } = pixels(img, 90)
  const keyOf = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
  const score = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const [, s, l] = rgbToHsl([r, g, b])
    if (l > 0.93 || l < 0.06) continue
    const k = keyOf(r, g, b)
    score.set(k, (score.get(k) ?? 0) + 1 + s * 2)
  }
  let bestKey = -1, bestScore = 0
  for (const [k, v] of score) if (v > bestScore) { bestKey = k; bestScore = v }
  if (bestKey < 0) return null
  // Average the real pixels in the winning bucket and its neighbors for a smoother result
  const br = bestKey >> 8, bg = (bestKey >> 4) & 15, bb = bestKey & 15
  let sr = 0, sg = 0, sb = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (Math.abs((r >> 4) - br) <= 1 && Math.abs((g >> 4) - bg) <= 1 && Math.abs((b >> 4) - bb) <= 1) {
      sr += r; sg += g; sb += b; n++
    }
  }
  return n ? toHex([sr / n, sg / n, sb / n]) : null
}

/** Average color of the pixels within radius of (x, y) on the canvas */
export function sampleAt(ctx: CanvasRenderingContext2D, x: number, y: number, radius = 2): string {
  const x0 = Math.max(0, Math.round(x - radius)), y0 = Math.max(0, Math.round(y - radius))
  const size = radius * 2 + 1
  const d = ctx.getImageData(x0, y0, size, size).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
  }
  return n ? toHex([r / n, g / n, b / n]) : '#000000'
}
