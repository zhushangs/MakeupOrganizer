/**
 * "Find by color": compare a color (or a palette's colors) from a photo with the collection,
 * the way eyes see color differences (CIE Lab + CIEDE2000).
 */
import { hexToLab, loadImage, toHex } from './color'
import type { Product } from './types'

type Lab = [number, number, number]

/** CIEDE2000 color difference: about 1 = barely visible, 2–5 = close, over 10 = clearly different */
export function deltaE(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360)
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p)
  const dLp = L2 - L1, dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2
  let hpm = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360
    hpm /= 2
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad)
    + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2)
  const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

export const closeness = (d: number) =>
  d < 2 ? { text: 'Almost the same', level: 'a' } as const
  : d < 5 ? { text: 'Very close', level: 'b' } as const
  : d < 10 ? { text: 'Similar', level: 'c' } as const
  : { text: 'A bit different', level: 'd' } as const

/** A color counts as "matched" in a palette under this difference */
export const MATCHED = 8

/** colors of an item, with their pan index, skipping empty pans */
const colorsOf = (p: Product) =>
  p.swatches.map((s, i) => ({ i, hex: s.hex, lab: s.hex ? hexToLab(s.hex) : null }))
    .filter((x): x is { i: number; hex: string; lab: Lab } => !!x.lab)

export interface SingleMatch { p: Product; pan: number; hex: string; d: number }

/** Items with a color close to this one: the closest pan of each, closest first */
export function matchColor(hex: string, items: Product[], limit = 20, maxD = 12): SingleMatch[] {
  const target = hexToLab(hex)
  if (!target) return []
  const out: SingleMatch[] = []
  for (const p of items) {
    if (p.noColor) continue
    let best: SingleMatch | null = null
    for (const c of colorsOf(p)) {
      const d = deltaE(target, c.lab)
      if (!best || d < best.d) best = { p, pan: c.i, hex: c.hex, d }
    }
    if (best && best.d <= maxD) out.push(best)
  }
  return out.sort((a, b) => a.d - b.d).slice(0, limit)
}

export interface PaletteMatch {
  p: Product
  /** 0–1 */
  score: number
  /** how many of the photo's colors have a close pan */
  matched: number
  /** pan indexes that answer one of the photo's colors */
  hitPans: number[]
  /** for each photo color: its closest pan and the difference */
  perTarget: { pan: number; d: number }[]
}

const sim = (d: number) => Math.max(0, 1 - d / 25)

/** Palettes (items with 2+ colors) that look like this set of colors */
export function matchPalette(hexes: string[], items: Product[], limit = 12): PaletteMatch[] {
  const targets = hexes.map(h => hexToLab(h)).filter((x): x is Lab => !!x)
  if (!targets.length) return []
  const out: PaletteMatch[] = []
  for (const p of items) {
    if (p.noColor) continue
    const pans = colorsOf(p)
    if (pans.length < 2) continue
    const perTarget = targets.map(t => {
      let best = { pan: -1, d: Infinity }
      for (const c of pans) { const d = deltaE(t, c.lab); if (d < best.d) best = { pan: c.i, d } }
      return best
    })
    // and the other way round: how much of the palette is in the photo
    const back = pans.map(c => Math.min(...targets.map(t => deltaE(t, c.lab))))
    const fwd = perTarget.reduce((s, x) => s + sim(x.d), 0) / targets.length
    const rev = back.reduce((s, d) => s + sim(d), 0) / pans.length
    const score = 0.7 * fwd + 0.3 * rev
    const hits = perTarget.filter(x => x.d < MATCHED)
    out.push({ p, score, matched: hits.length, hitPans: [...new Set(hits.map(x => x.pan))], perTarget })
  }
  return out.filter(m => m.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Single-color items that are close to the photo colors the best palette doesn't have */
export function fillTheGap(hexes: string[], best: PaletteMatch | undefined, items: Product[]): (SingleMatch & { target: string })[] {
  const missing = hexes.filter((_, i) => !best || (best.perTarget[i]?.d ?? Infinity) >= MATCHED)
  const singles = items.filter(p => !p.noColor && colorsOf(p).length === 1)
  const out: (SingleMatch & { target: string })[] = []
  for (const h of missing) {
    const m = matchColor(h, singles, 1, 6)[0]
    if (m && !out.some(o => o.p.id === m.p.id)) out.push({ ...m, target: h })
  }
  return out
}

/**
 * The main colors of a palette photo (k-means in Lab). Skips the white background and the
 * black/gray packaging; colors that end up very close are merged. Light to dark.
 */
export async function paletteColors(src: string, k = 7): Promise<string[]> {
  const img = await loadImage(src)
  const scale = Math.min(1, 140 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const px: { lab: Lab; rgb: [number, number, number] }[] = []
  // edges between pans and packaging blend two colors into a third that isn't there: keep only
  // pixels that look like their neighbors
  const near = (i: number, j: number) =>
    Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) < 36
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const x = (i / 4) % w, y = Math.floor(i / 4 / w)
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue
    if (!near(i, i - 4) || !near(i, i + 4) || !near(i, i - 4 * w) || !near(i, i + 4 * w)) continue
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]]
    const lab = hexToLab(toHex(rgb))!
    const chroma = Math.hypot(lab[1], lab[2])
    if (chroma < 6 && (lab[0] > 90 || lab[0] < 22)) continue // background / packaging
    px.push({ lab, rgb })
  }
  if (px.length < 20) return []
  // k-means++ with a fixed seed, so the same photo gives the same colors
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centers: Lab[] = [px[Math.floor(rand() * px.length)].lab]
  while (centers.length < Math.min(k, px.length)) {
    const ds = px.map(p => Math.min(...centers.map(cn => dist2(p.lab, cn))))
    const total = ds.reduce((s, d) => s + d, 0)
    let r = rand() * total, j = 0
    while (j < ds.length - 1 && (r -= ds[j]) > 0) j++
    centers.push(px[j].lab)
  }
  let assign = new Array(px.length).fill(0)
  for (let iter = 0; iter < 12; iter++) {
    assign = px.map(p => { let bi = 0, bd = Infinity; centers.forEach((cn, ci) => { const d = dist2(p.lab, cn); if (d < bd) { bd = d; bi = ci } }); return bi })
    for (let ci = 0; ci < centers.length; ci++) {
      const mem = px.filter((_, i) => assign[i] === ci)
      if (mem.length) centers[ci] = [0, 1, 2].map(j => mem.reduce((s, m) => s + m.lab[j], 0) / mem.length) as Lab
    }
  }
  let clusters = centers.map((_, ci) => {
    const mem = px.filter((__, i) => assign[i] === ci)
    const rgb = [0, 1, 2].map(j => mem.reduce((s, m) => s + m.rgb[j], 0) / Math.max(1, mem.length)) as [number, number, number]
    return { n: mem.length, hex: toHex(rgb) }
  }).filter(cl => cl.n >= px.length * 0.03)
  // merge near-duplicates (keep the bigger one)
  clusters.sort((a, b) => b.n - a.n)
  const kept: typeof clusters = []
  for (const cl of clusters) if (!kept.some(kp => deltaE(hexToLab(kp.hex)!, hexToLab(cl.hex)!) < 6)) kept.push(cl)
  clusters = kept
  return clusters.map(cl => cl.hex).sort((a, b) => hexToLab(b)![0] - hexToLab(a)![0])
}
