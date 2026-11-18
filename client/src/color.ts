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

/** sRGB hex → CIE Lab (D65): distances and lightness the way eyes see them, unlike HSL */
export function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * Color families in the order "By color" shows them; inside a family, light to dark.
 * Decided in LCh (Lab as lightness, chroma = colorfulness, hue angle), so a muted nude and a dark
 * brown, or a pale pink and a deep berry, land where they look like they belong.
 */
export const COLOR_FAMILIES = ['Nude', 'Pink', 'Coral', 'Red', 'Berry', 'Purple', 'Brown', 'Gold', 'Green', 'Blue', 'Neutral'] as const
export type ColorFamily = (typeof COLOR_FAMILIES)[number]

export function colorFamily(lab: [number, number, number]): ColorFamily {
  const [L, a, b] = lab
  const C = Math.hypot(a, b)
  const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
  if (C < 9) return 'Neutral'
  if (h >= 345 || h < 22) {
    // pinks, roses, reds leaning blue, berries
    if (L < 42) return 'Berry'
    if (C < 30 && L >= 55) return 'Nude'
    // only the orange-leaning end of this range reads as red; the rest are (hot) pinks
    return h >= 15 && h < 22 && C >= 50 && L < 55 ? 'Red' : 'Pink'
  }
  if (h < 45) {
    // red-orange: true reds, corals, rosy nudes and browns
    if (C >= 50) return L < 55 ? 'Red' : 'Coral'
    if (L >= 62) return C >= 35 ? 'Coral' : 'Nude'
    return 'Brown'
  }
  if (h < 75) {
    // orange to tan: corals, peachy nudes, browns
    if (C >= 50 && L >= 50) return 'Coral'
    return L >= 62 ? 'Nude' : 'Brown'
  }
  if (h < 105) return C >= 35 && L >= 45 ? 'Gold' : L >= 62 ? 'Nude' : 'Brown'
  if (h < 200) return 'Green'
  if (h < 285) return 'Blue'
  // violet → magenta: lavender, mauve, purple; deep reddish ones are berries
  return h >= 320 && L < 35 ? 'Berry' : 'Purple'
}

/** The color a product reads as: the average (in Lab) of all its colors, so a palette isn't just its first pan */
export function representativeLab(hexes: (string | null | undefined)[]): [number, number, number] | null {
  const labs = hexes.map(h => (h ? hexToLab(h) : null)).filter((x): x is [number, number, number] => !!x)
  if (!labs.length) return null
  const n = labs.length
  return [labs.reduce((s, x) => s + x[0], 0) / n, labs.reduce((s, x) => s + x[1], 0) / n, labs.reduce((s, x) => s + x[2], 0) / n]
}

/** Sort key for "By color": family first, then light → dark, then hue; items without a color last */
export function colorSortKey(hexes: (string | null | undefined)[]): number {
  const lab = representativeLab(hexes)
  if (!lab) return 1e9
  const fam = COLOR_FAMILIES.indexOf(colorFamily(lab))
  const h = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360
  return fam * 1e6 + Math.round((100 - lab[0]) * 100) * 10 + Math.floor(h / 36)
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
