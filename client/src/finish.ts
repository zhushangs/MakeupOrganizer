/**
 * Finishes (texture) of a color: matte, satin, shimmer, metallic, glitter.
 * On screen they're CSS overlays (.fin-* in styles.css, via <FinishLayer>); on the saved PNG cards
 * and charts they're painted on the canvas by paintFinish(), made to look the same.
 */
export const FINISHES = ['matte', 'satin', 'shimmer', 'metallic', 'glitter'] as const
export type Finish = (typeof FINISHES)[number]

export const FINISH_LABELS: Record<Finish, string> = {
  matte: 'Matte', satin: 'Satin', shimmer: 'Shimmer', metallic: 'Metallic', glitter: 'Glitter',
}

/** Missing / unknown values are matte (everything saved before finishes existed) */
export const finishOf = (f: unknown): Finish => (FINISHES as readonly string[]).includes(f as string) ? f as Finish : 'matte'

// ---------------------------------------------------------------------------------------------
// Canvas version

/** Small deterministic PRNG so a card looks the same every time it's saved */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const tiles = new Map<string, HTMLCanvasElement>()
function tile(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void) {
  let c = tiles.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = size
    draw(c.getContext('2d')!, rng(key.length * 7919 + size))
    tiles.set(key, c)
  }
  return c
}

/** White specks on transparent: fine (shimmer) or big (glitter) */
const specks = (big: boolean) => tile(big ? 'specks-big' : 'specks-fine', 256, (ctx, rand) => {
  const n = big ? 70 : 520
  for (let i = 0; i < n; i++) {
    const r = big ? 0.9 + rand() * 1.6 : 0.35 + rand() * 0.55
    ctx.fillStyle = big && rand() < 0.3 ? 'rgba(255,240,210,1)' : `rgba(255,255,255,${0.55 + rand() * 0.45})`
    ctx.beginPath()
    ctx.ellipse(rand() * 256, rand() * 256, r, r * (0.6 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
})

/** Gray grain around 50% (for overlay blending: lighter and darker flecks, the hue stays) */
const grain = () => tile('grain', 128, (ctx, rand) => {
  const img = ctx.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, 128 + (rand() + rand() - 1) * 230))
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
})

/** Soft horizontal streaks (satin, like a swatch of lipstick drawn across) */
const streaks = () => tile('streaks', 128, (ctx, rand) => {
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, rand() - 0.55) * 0.5})`
    ctx.fillRect(0, y, 128, 2 + Math.floor(rand() * 3))
  }
})

/** Repeat a texture tile over the rect; `px` = how big one tile pixel is drawn */
function fillTile(ctx: CanvasRenderingContext2D, t: HTMLCanvasElement, x: number, y: number, w: number, h: number, px: number, sx = px, sy = px) {
  const tw = t.width * sx, th = t.height * sy
  for (let ty = y; ty < y + h; ty += th) {
    for (let tx = x; tx < x + w; tx += tw) ctx.drawImage(t, tx, ty, tw, th)
  }
}

/**
 * Paint a finish over a color already filled in (x, y, w, h). The caller has clipped to the shape.
 * Scales with the swatch so a small chart cell and a big single card look alike.
 */
export function paintFinish(ctx: CanvasRenderingContext2D, finish: Finish | null | undefined, x: number, y: number, w: number, h: number) {
  const f = finishOf(finish)
  if (f === 'matte' || w < 2 || h < 2) return
  // one "CSS pixel" of the on-screen card ≈ this many canvas pixels (home cards are ~170px wide)
  const u = Math.max(1, Math.min(w, h) / 170)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  if (f === 'satin') {
    // body: highlight just under the top edge, a shadow below it, darker towards the bottom
    let g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, 'rgba(0,0,0,.18)')
    g.addColorStop(0.04, 'rgba(255,255,255,.55)')
    g.addColorStop(0.09, 'rgba(255,255,255,.25)')
    g.addColorStop(0.16, 'rgba(0,0,0,.20)')
    g.addColorStop(0.30, 'rgba(255,255,255,.12)')
    g.addColorStop(0.45, 'rgba(0,0,0,0)')
    g.addColorStop(0.70, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,.25)')
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 0.5
    fillTile(ctx, streaks(), x, y, w, h, u, u * 6, u * 1.5)
    ctx.globalAlpha = 1
    // the bright ridge along the top
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = `blur(${1.2 * u}px)`
    ctx.save()
    ctx.translate(x + w * 0.45, y)
    ctx.scale(1, (0.09 * h) / (1.2 * w))
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.2 * w)
    g.addColorStop(0.5, 'rgba(255,255,255,0)')
    g.addColorStop(0.7, 'rgba(255,255,255,.5)')
    g.addColorStop(0.85, 'rgba(255,255,255,.13)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-w, 0, 3 * w, 1.2 * w)
    ctx.restore()
    ctx.filter = 'none'
  } else if (f === 'shimmer') {
    ctx.globalCompositeOperation = 'screen'
    fillTile(ctx, specks(false), x, y, w, h, u * 0.45)
    fillTile(ctx, specks(false), x + 37 * u, y + 53 * u, w, h, u * 0.4)
  } else if (f === 'metallic') {
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.5
    ctx.imageSmoothingEnabled = true
    fillTile(ctx, grain(), x, y, w, h, u * 0.9)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.6
    fillTile(ctx, specks(false), x, y, w, h, u * 0.5)
    // a faint glow and darker edges, like a swatch on skin
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const r = Math.max(w, h)
    const g = ctx.createRadialGradient(x + w * 0.45, y + h * 0.4, r * 0.25, x + w / 2, y + h / 2, r * 0.75)
    g.addColorStop(0, 'rgba(255,255,255,.06)')
    g.addColorStop(0.6, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,.16)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  } else if (f === 'glitter') {
    ctx.globalCompositeOperation = 'screen'
    fillTile(ctx, specks(true), x, y, w, h, u * 0.62)
    ctx.globalAlpha = 0.6
    fillTile(ctx, specks(false), x, y, w, h, u * 0.55)
  }
  ctx.restore()
}
