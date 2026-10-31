/**
 * Turns OCR text from an order / cart screenshot into draft items.
 * Pure heuristics (no AI): brand list + "Color:" / "Shade:" labels + $ amounts.
 * Anything it can't find is left null for the user to fill in.
 */

export interface DraftItem {
  brand: string | null
  name: string | null
  shadeName: string | null
  category: string
  originalPrice: number | null
  paidPrice: number | null
}

export interface ParsedReceipt {
  channel: string | null
  items: DraftItem[]
}

// Longer names first so "Charlotte Tilbury" wins over shorter partial matches.
const BRANDS = [
  'Anastasia Beverly Hills', 'Charlotte Tilbury', 'Estée Lauder', 'Estee Lauder', 'Giorgio Armani', 'Armani Beauty',
  'Yves Saint Laurent', 'Saint Laurent', 'Laura Mercier', 'Laura Geller', 'Bobbi Brown', 'Too Faced', 'Urban Decay',
  'Huda Beauty', 'Fenty Beauty', 'Rare Beauty', 'Pat McGrath Labs', 'Pat McGrath', 'Natasha Denona', 'Tom Ford',
  'Kylie Cosmetics', 'Haus Labs', 'Makeup by Mario', 'MAKEUP BY MARIO', 'Hourglass', 'Benefit Cosmetics', 'Benefit',
  'Tarte', 'NARS', 'MAC Cosmetics', 'M·A·C', 'MAC', 'Dior', 'Chanel', 'YSL', 'Lancôme', 'Lancome', 'Clinique',
  'Shiseido', 'Givenchy', 'Guerlain', 'Sisley', 'Hermès', 'Hermes', 'Gucci', 'Prada Beauty', 'Valentino Beauty',
  'Burberry', 'Kosas', 'Ilia', 'ILIA', 'Westman Atelier', 'Glossier', 'Summer Fridays', 'Laneige', 'Tower 28',
  'Saie', 'Merit', 'Danessa Myricks', 'Danessa Myricks Beauty', 'Patrick Ta', 'Dior Beauty', 'Sephora Collection',
  'Ulta Beauty Collection', 'Morphe', 'ColourPop', 'Colourpop', 'e.l.f. Cosmetics', 'e.l.f.', 'elf', 'NYX Professional Makeup', 'NYX',
  'Maybelline New York', 'Maybelline', "L'Oréal Paris", "L'Oreal Paris", "L'Oreal", 'Revlon', 'Milani', 'Wet n Wild',
  'Rimmel', 'Covergirl', 'CoverGirl', 'Physicians Formula', 'Juvia\'s Place', 'BH Cosmetics', 'Makeup Revolution',
  'Smashbox', 'Stila', 'Becca', 'Bareminerals', 'bareMinerals', 'It Cosmetics', 'IT Cosmetics', 'Kiko Milano',
  'Clarins', 'Sulwhasoo', 'Hera', 'Romand', 'rom&nd', 'Peripera', '3CE', 'Etude', 'Clio', 'Amuse', 'Fwee',
  'Judydoll', 'Florasis', 'Perfect Diary', 'Colorkey', 'Mao Geping', 'Kevyn Aucoin', 'Victoria Beckham Beauty',
  'Jones Road', 'Rhode', 'Lawless', 'One/Size', 'ONE/SIZE', 'Sol de Janeiro', 'Supergoop!', 'Supergoop',
  'Dolce&Gabbana', 'Dolce & Gabbana', 'Nudestix', 'Bésame', 'Besame', 'Lisa Eldridge', 'Byredo', 'Rare Beauty by Selena Gomez',
  'KVD Beauty', 'KVD', 'Fenty', 'Huda', 'Mented Cosmetics', 'Dose of Colors', 'Jeffree Star Cosmetics', 'Jeffree Star',
].sort((a, b) => b.length - a.length)

const CHANNELS: [RegExp, string][] = [
  [/sephora/i, 'Sephora'], [/\bulta\b/i, 'Ulta'], [/amazon/i, 'Amazon'], [/nordstrom/i, 'Nordstrom'],
  [/macy'?s/i, "Macy's"], [/bloomingdale/i, "Bloomingdale's"], [/saks/i, 'Saks Fifth Avenue'], [/neiman/i, 'Neiman Marcus'],
  [/target/i, 'Target'], [/walmart/i, 'Walmart'], [/cvs/i, 'CVS'], [/walgreens/i, 'Walgreens'], [/yesstyle/i, 'YesStyle'],
  [/olive ?young/i, 'Olive Young'], [/dermstore/i, 'Dermstore'], [/space ?nk/i, 'Space NK'], [/revolve/i, 'Revolve'],
  [/taobao|淘宝/i, 'Taobao'], [/tmall|天猫/i, 'Tmall'],
]

const CATEGORY_RULES: [RegExp, string][] = [
  [/palette|eye ?shadow|eyeshadow|眼影/i, 'eyeshadow'],
  [/lipstick|lip colou?r|rouge|lip balm|lip crayon|口红|唇膏/i, 'lipstick'],
  [/gloss|lip oil|lip stain|liquid lip|lacquer|lip tint|lip luminizer|唇釉|唇彩|唇蜜/i, 'lipgloss'],
  [/blush|cheek|腮红/i, 'blush'],
  [/highlight|bronzer|contour|glow stick|高光|修容/i, 'highlight'],
  [/foundation|concealer|powder|primer|cushion|skin tint|setting spray|粉底|遮瑕|气垫|散粉/i, 'base'],
]

export function guessCategory(text: string): string | null {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text)) return cat
  return null
}

/** Lines that are never part of a product title */
const NOISE = /^(shopping (cart|bag)|your (bag|cart|orders?)|my (bag|cart|orders?)|order details|wish ?list|loves\b|recently viewed|sub ?total|total|order total|estimated|est\.|tax|taxes|shipping|delivery|order\b|order #|qty|quantity|size\b|item\b|item #|sku|points|beauty insider|ultamate|rewards|delivered|arriving|shipped|out for|return|buy (it )?again|write a review|review|track|reorder|add to|sold by|ship(ped)? to|payment|visa|mastercard|amex|paypal|apple pay|promo|coupon|discount|you saved|savings|merchandise|items?\s*\(|view (order|details)|details|invoice|status|in stock|free\b|pickup|same-day|get it|edit|remove|save for later|move to|gift card|bag|basket|cart|checkout|summary|\d+ items?$)/i

/** Order totals: everything from here down is not a product */
const TOTALS = /\b(sub ?total|order total|estimated total|order summary|grand total)\b|^(tax|taxes|total)\b/i

const PRICE_RE = /\$\s?(\d{1,4}(?:,\d{3})*)(?:[.,:](\d{2}))?/g
const SHADE_RE = /\b(?:colou?r|shade|tone|finish|color name)\s*[:：\-–]\s*(.+)$/i
const SIZE_LIKE = /^\s*(\d+(\.\d+)?\s*(oz|fl\.? ?oz|ml|g|mg|count|ct|pcs?)\b|mini|full size|travel size|standard size)/i

const clean = (s: string) => s
  .replace(/[|•·]+\s*$/g, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[\s\-–•·*>]+|[\s\-–•·*]+$/g, '')
  .trim()

interface Amount { value: number; hasCents: boolean; digits: string }

function amounts(line: string): Amount[] {
  const out: Amount[] = []
  for (const m of line.matchAll(PRICE_RE)) {
    const digits = m[1].replace(/,/g, '')
    const v = parseFloat(digits + '.' + (m[2] ?? '00'))
    if (v > 0 && v < 100000) out.push({ value: v, hasCents: m[2] != null, digits })
  }
  return out
}

const prices = (line: string) => amounts(line).map(a => a.value)

/**
 * A struck-through price often OCRs as "$3766" or "$7560" (the line garbles the decimal point and cents).
 * For a cents-less 4+ digit amount that's way above the other prices, use the smallest leading-digit
 * prefix that's still at least the highest normal price (an original price is never below the paid one).
 * Not exact (7.50 → 7), but close, and the user reviews every row anyway.
 */
function fixStruckPrices(list: Amount[]): number[] {
  const normal = list.filter(a => a.hasCents || a.digits.length < 4).map(a => a.value)
  const ref = normal.length ? Math.max(...normal) : 0
  return list.map(a => {
    if (a.hasCents || a.digits.length < 4 || (ref > 0 && a.value <= ref * 8)) return a.value
    if (ref === 0) return parseFloat(a.digits.slice(0, -2))
    for (let k = 1; k < a.digits.length; k++) {
      const v = parseFloat(a.digits.slice(0, k))
      if (v >= ref) return v
    }
    return a.value
  }).filter(v => v > 0 && v < 5000)
}

// "NY X Professional Makeup": OCR sometimes inserts spaces, so allow an optional space between letters
const BRAND_RES = BRANDS.map(b => ({
  brand: b,
  re: new RegExp('^' + [...b.replace(/\s+/g, '')].map(ch => ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('\\s?') + '(?=$|[\\s,:–-])', 'i'),
}))

function matchBrand(line: string): { brand: string; rest: string } | null {
  for (const { brand, re } of BRAND_RES) {
    const m = re.exec(line)
    if (!m) continue
    const head = m[0]
    // Short ambiguous brands ("MAC", "NYX", "Hera") only count when the line is just that word or it's in caps
    if (brand.replace(/\s/g, '').length <= 4 && head.length !== line.length && head !== head.toUpperCase()) continue
    return { brand: brand === 'M·A·C' ? 'MAC' : brand, rest: clean(line.slice(head.length).replace(/^[\s,\-–:]+/, '')) }
  }
  return null
}

function extractShade(line: string): string | null {
  const m = SHADE_RE.exec(line)
  if (!m) return null
  // "COLOR: Hope • SIZE 0.25 oz" → "Hope"
  const v = clean(m[1].split(/\s+[•·|]\s+|\s+(?:size|item|sku|qty)\b/i)[0])
  return v || null
}

const isMeta = (l: string) =>
  NOISE.test(l) || SIZE_LIKE.test(l) || /^[\d\s$.,:/#()-]+$/.test(l) || l.length < 2 || SHADE_RE.test(l)

function draftFrom(block: string[], brandHit: { brand: string; rest: string } | null): DraftItem | null {
  let brand = brandHit?.brand ?? null
  let name: string | null = brandHit?.rest || null
  let shade: string | null = null
  const found: Amount[] = []

  for (const line of block) {
    // stop at order totals
    if (TOTALS.test(line)) break
    shade ??= extractShade(line)
    found.push(...amounts(line))
  }

  // Name: first real text line (skipping the brand line itself)
  const textLines = block.filter((l, i) => !(i === 0 && brandHit) && !isMeta(l) && prices(l).length === 0)
  if (brandHit) {
    // Long titles wrap onto several lines: join consecutive title lines until a size/color/price line
    const parts = brandHit.rest ? [brandHit.rest] : []
    for (const l of block.slice(1)) {
      if (isMeta(l) || prices(l).length || parts.length >= 3) break
      parts.push(l)
    }
    name = parts.join(' ').replace(/,\s*$/, '') || null
  } else if (!name) {
    name = textLines[0] ?? null
  }

  // No brand from the list: an ALL-CAPS short first line is usually the brand (Sephora style)
  if (!brand && textLines.length >= 2) {
    const first = textLines[0]
    if (first === first.toUpperCase() && /[A-Z]/.test(first) && first.split(' ').length <= 4) {
      brand = first.replace(/\b([A-Z])([A-Z']+)\b/g, (_, a, b) => a + b.toLowerCase())
      name = textLines[1]
    }
  }

  // Amazon style: "Brand Product Name, Shade, 0.17 fl oz"
  if (name && !shade && name.includes(',')) {
    const parts = name.split(',').map(p => p.trim()).filter(Boolean)
    const candidate = parts.slice(1).find(p => !SIZE_LIKE.test(p) && !/\b(pack|count|set of)\b/i.test(p) && p.split(' ').length <= 5)
    if (candidate) { shade = candidate; name = parts[0] }
  }

  if (!brand && !name) return null

  const distinct = [...new Set(fixStruckPrices(found))].sort((a, b) => a - b)
  const paid = distinct.length ? distinct[0] : null
  const original = distinct.length > 1 ? distinct[distinct.length - 1] : null

  return {
    brand,
    name,
    shadeName: shade,
    category: guessCategory(`${name ?? ''} ${shade ?? ''}`) ?? 'other',
    originalPrice: original,
    paidPrice: paid,
  }
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
  const channel = CHANNELS.find(([re]) => re.test(text))?.[1] ?? null

  // Cut off everything after the order totals
  const end = lines.findIndex(l => TOTALS.test(l))
  const body = end >= 0 ? lines.slice(0, end) : lines

  const items: DraftItem[] = []

  // 1) Split on lines that start with a known brand
  const starts: { i: number; hit: { brand: string; rest: string } }[] = []
  body.forEach((l, i) => { const hit = matchBrand(l); if (hit) starts.push({ i, hit }) })

  if (starts.length) {
    starts.forEach((s, k) => {
      const block = body.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : body.length)
      const d = draftFrom(block, s.hit)
      if (d) items.push(d)
    })
    return { channel, items }
  }

  // 2) No known brands: each product block ends at a line with a price
  let blockStart = 0
  body.forEach((l, i) => {
    if (prices(l).length && !NOISE.test(l)) {
      // include following price-only lines (e.g. struck-through original price) in this block
      let j = i
      while (j + 1 < body.length && /^[\s$\d.,:]+$/.test(body[j + 1]) && prices(body[j + 1]).length) j++
      const block = body.slice(blockStart, j + 1)
      if (block.some(x => !isMeta(x) && prices(x).length === 0)) {
        const d = draftFrom(block, null)
        if (d) items.push(d)
      }
      blockStart = j + 1
    }
  })
  return { channel, items }
}
