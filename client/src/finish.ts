/**
 * Finishes (texture) of a color: matte, sheen, satin, shimmer, metallic, glitter.
 * Sheen is a powder with a soft pearly glow (between matte and shimmer); satin is a creamy, lipstick-like gloss.
 * On screen they're CSS overlays (.fin-* in styles.css, via <FinishLayer>); on the saved PNG cards
 * and charts they're painted on the canvas by paintFinish(), made to look the same.
 */
export const FINISHES = ['matte', 'sheen', 'satin', 'shimmer', 'metallic', 'glitter'] as const
export type Finish = (typeof FINISHES)[number]

export const FINISH_LABELS: Record<Finish, string> = {
  matte: 'Matte', sheen: 'Sheen', satin: 'Satin', shimmer: 'Shimmer', metallic: 'Metallic', glitter: 'Glitter',
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

/**
 * Texture tiles, shared by the canvas painter and the on-screen CSS (installFinishTextures), so both
 * look the same in every browser. Each tile is drawn TILE_CSS[name] "CSS px" wide on a ~170px swatch.
 */
const TILE_CSS = { shimmer: 128, glitter: 150, grain: 128, sheen: 96 }

/** Shimmer: lots of fine white dust */
const shimmerTile = () => tile('shimmer', 512, (ctx, rand) => {
  for (let i = 0; i < 2300; i++) {
    const r = 1.2 + rand() * 1.8
    ctx.fillStyle = `rgba(255,255,255,${0.45 + rand() * 0.55})`
    ctx.beginPath()
    ctx.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2)
    ctx.fill()
  }
})

/** Draw at (x, y) and again across the tile edges, so a tile repeats without visible seams */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [0, -size, size]) {
    for (const dy of [0, -size, size]) {
      if ((dx === 0 || Math.abs(x + dx - size / 2) < size / 2 + r) && (dy === 0 || Math.abs(y + dy - size / 2) < size / 2 + r)) draw(x + dx, y + dy)
    }
  }
}

/** Flake outline: a hexagon (sequins) or an irregular chip */
function flake(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number, hex: boolean) {
  const n = hex ? 6 : 4 + Math.floor(rand() * 3)
  const rot = rand() * Math.PI
  ctx.beginPath()
  for (let k = 0; k < n; k++) {
    const a = rot + (k * Math.PI * 2) / n
    const rr = hex ? r : r * (0.6 + rand() * 0.5)
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/**
 * Glitter, tone layer (blended with "overlay", so every flake is a lighter or darker shade of the
 * color itself): fine dust, chips, and big hexagonal sequins with a light and a dark facet.
 */
const glitterTone = () => tile('glitter-tone', 512, (ctx, rand) => {
  ctx.fillStyle = 'rgb(128,128,128)'
  ctx.fillRect(0, 0, 512, 512)
  const gray = (v: number, a = 1) => `rgba(${v},${v},${v},${a})`
  const layers: [number, number, number, boolean][] = [
    // count, min r, max r, hexagon
    [8000, 1.2, 3, false],
    [1300, 3, 7, false],
    [260, 6, 11, true],
    [45, 11, 17, true],
  ]
  for (const [count, r0, r1, hex] of layers) {
    for (let i = 0; i < count; i++) {
      const x = rand() * 512, y = rand() * 512, r = r0 + rand() * (r1 - r0)
      const light = 70 + rand() * 175
      const shine = rand()
      wrapped(512, x, y, r, (px, py) => {
        flake(ctx, rand, px, py, r, hex)
        if (hex || r > 4) {
          // a facet that catches the light on one side and is darker on the other
          const a = shine * Math.PI * 2
          const g = ctx.createLinearGradient(px - Math.cos(a) * r, py - Math.sin(a) * r, px + Math.cos(a) * r, py + Math.sin(a) * r)
          g.addColorStop(0, gray(Math.min(255, light + 70)))
          g.addColorStop(0.5, gray(light))
          g.addColorStop(1, gray(Math.max(30, light - 80)))
          ctx.fillStyle = g
        } else ctx.fillStyle = gray(light)
        ctx.fill()
      })
    }
  }
})

/**
 * Glitter, sparkle layer (blended with "screen"): iridescent tints on some flakes, and soft
 * glints where a flake catches the light.
 */
const glitterSpark = () => tile('glitter-spark', 512, (ctx, rand) => {
  const tints = ['140,220,255', '255,170,220', '255,225,150', '190,170,255', '170,255,220']
  for (let i = 0; i < 140; i++) {
    const x = rand() * 512, y = rand() * 512, r = 4 + rand() * 10
    const t = tints[Math.floor(rand() * tints.length)]
    wrapped(512, x, y, r, (px, py) => {
      flake(ctx, rand, px, py, r, rand() < 0.6)
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r)
      g.addColorStop(0, `rgba(${t},.6)`)
      g.addColorStop(1, `rgba(${t},.05)`)
      ctx.fillStyle = g
      ctx.fill()
    })
  }
  for (let i = 0; i < 230; i++) {
    const x = rand() * 512, y = rand() * 512, r = 1.5 + rand() * 3.5
    wrapped(512, x, y, r * 2, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2)
      g.addColorStop(0, 'rgba(255,255,255,.95)')
      g.addColorStop(0.25, 'rgba(255,255,255,.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(px - r * 2, py - r * 2, r * 4, r * 4)
    })
  }
})

/** Gray grain around 50% (for overlay blending: lighter and darker flecks, the hue stays) */
const grain = () => tile('grain', 256, (ctx, rand) => {
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, 128 + (rand() + rand() - 1) * 230))
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
})

/** Sheen: very fine, low-contrast grain (a pressed powder with micro-pearl; no visible sparkle) */
const sheenTile = () => tile('sheen', 256, (ctx, rand) => {
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    // mostly mid-gray with a few slightly brighter specks of pearl
    const v = 128 + (rand() + rand() - 1) * 70 + (rand() < 0.04 ? 60 : 0)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v))
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
})

/** Put the tiles into CSS variables (--tex-shimmer, --tex-glitter-tone / -spark, --tex-grain) used by .fin-* */
export function installFinishTextures() {
  try {
    const root = document.documentElement.style
    root.setProperty('--tex-shimmer', `url(${shimmerTile().toDataURL()})`)
    root.setProperty('--tex-glitter-tone', `url(${glitterTone().toDataURL()})`)
    root.setProperty('--tex-glitter-spark', `url(${glitterSpark().toDataURL()})`)
    root.setProperty('--tex-grain', `url(${grain().toDataURL()})`)
    root.setProperty('--tex-sheen', `url(${sheenTile().toDataURL()})`)
  } catch { /* no canvas: swatches just show without texture */ }
}

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
  } else if (f === 'sheen') {
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.55
    fillTile(ctx, sheenTile(), x, y, w, h, (u * TILE_CSS.sheen) / 256)
    // a soft pearly glow, lighter towards one corner
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'soft-light'
    const r = Math.max(w, h)
    const g = ctx.createRadialGradient(x + w * 0.3, y + h * 0.25, 0, x + w * 0.3, y + h * 0.25, r * 1.1)
    g.addColorStop(0, 'rgba(255,255,255,.2)')
    g.addColorStop(0.55, 'rgba(255,255,255,.07)')
    g.addColorStop(1, 'rgba(0,0,0,.1)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  } else if (f === 'shimmer') {
    ctx.globalCompositeOperation = 'screen'
    fillTile(ctx, shimmerTile(), x, y, w, h, (u * TILE_CSS.shimmer) / 512)
  } else if (f === 'metallic') {
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.5
    ctx.imageSmoothingEnabled = true
    fillTile(ctx, grain(), x, y, w, h, (u * TILE_CSS.grain) / 256)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.5
    fillTile(ctx, shimmerTile(), x, y, w, h, (u * TILE_CSS.shimmer) / 512)
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
    const px = (u * TILE_CSS.glitter) / 512
    ctx.globalCompositeOperation = 'overlay'
    fillTile(ctx, glitterTone(), x, y, w, h, px)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.8
    fillTile(ctx, glitterSpark(), x, y, w, h, px)
  }
  ctx.restore()
}
