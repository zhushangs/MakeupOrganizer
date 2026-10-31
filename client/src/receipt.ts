import { DEFAULT_CATEGORIES, getCategories } from './types'

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
  // the user's own categories first, matched by name ("Mascara", "Lip Liner" …)
  const t = text.toLowerCase()
  for (const c of getCategories()) {
    if (DEFAULT_CATEGORIES.some(d => d.key === c.key)) continue
    const label = c.label.toLowerCase().replace(/s$/, '')
    if (label.length > 1 && t.includes(label)) return c.key
  }
  const known = new Set(getCategories().map(c => c.key))
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text) && known.has(cat)) return cat
  return null
}

/** Lines that are never part of a product title */
const NOISE = /^(shopping (cart|bag)|your (bag|cart|orders?)|my (bag|cart|orders?)|order ?details|order ?history|purchases|wish ?list|loves\b|recently viewed|sub ?total|total|order total|estimated|est\.|tax|taxes|shipping|delivery|order\b|order #|qty|quantity|size\b|item\b|item #|sku|points|beauty insider|ultamate|rewards|delivered|arriving|shipped|out for|return|buy (it )?again|write a review|review|track|reorder|add to|sold by|ship(ped)? to|payment|visa|mastercard|amex|paypal|apple pay|promo|coupon|discount|you saved|savings|merchandise|items?\s*\(|view (order|details)|details|invoice|status|in stock|free\b|pickup|same-day|get it|edit|remove|save for later|move to|gift card|bag|basket|cart|checkout|summary|\d+ items?$)/i

/** Order totals: everything from here down is not a product */
const TOTALS = /\b(sub ?total|order total|estimated total|order summary|grand total)\b|^(tax|taxes|total)\b/i

const PRICE_RE = /\$\s?(\d{1,4}(?:,\d{3})*)(?:[.,:](\d{2}))?/g
const SHADE_RE = /\b(?:colou?r|shade|tone|finish|color name)\s*[:：\-–]\s*(.+)$/i
const SIZE_LIKE = /^\s*(\d+(\.\d+)?\s*(oz|fl\.? ?oz|ml|g|mg|count|ct|pcs?)\b|(mini|full|travel|standard|deluxe) size\b|mini$)/i

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
const brandRe = (b: string) => new RegExp('^' + [...b.replace(/\s+/g, '')].map(ch => ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('\\s?') + '(?=$|[\\s,:–-])', 'i')
let BRAND_RES = BRANDS.map(b => ({ brand: b, re: brandRe(b) }))

/** Add the user's own brands (from Settings and from items they own) to the matcher */
export function setExtraBrands(extra: string[]) {
  const all = [...new Set([...extra.map(b => b.trim()).filter(b => b.length > 1), ...BRANDS])]
    .sort((a, b) => b.length - a.length)
  BRAND_RES = all.map(b => ({ brand: b, re: brandRe(b) }))
}

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

/** Lines that describe an item (so the title must be just above them) */
const isDetail = (l: string) => SHADE_RE.test(l) || /^(size|item|sku)\b/i.test(l) || prices(l).length > 0

const isTitle = (l: string) => !isMeta(l) && prices(l).length === 0 && /[A-Za-z]{2}/.test(l)

/** "EADEM" → "Eadem", "MAKEUP BY MARIO" → "Makeup By Mario"; short all-caps names (MAC, NYX) stay as is */
function prettyBrand(line: string): string {
  if (line !== line.toUpperCase()) return line
  return line.replace(/[A-Z][A-Z']+/g, w => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
}

function draftFrom(block: string[]): DraftItem | null {
  let shade: string | null = null
  const found: Amount[] = []
  for (const line of block) {
    if (TOTALS.test(line)) break
    shade ??= extractShade(line)
    found.push(...amounts(line))
  }

  // Title = the group of consecutive text lines (brand + product name, which may wrap) right before the
  // item's details. Earlier groups are page chrome (status bar, "Your Bag", store logo…).
  const firstDetail = block.findIndex(isDetail)
  const scope = firstDetail >= 0 ? block.slice(0, firstDetail) : block
  const groups: string[][] = []
  scope.forEach((l, i) => {
    if (!isTitle(l)) return
    if (i > 0 && isTitle(scope[i - 1])) groups[groups.length - 1].push(l)
    else groups.push([l])
  })
  let title = groups.pop() ?? block.filter(isTitle).slice(0, 1)
  // A page header that OCR glued onto the first item ("Orderdetails", "EADEM", "Le Chouchou…"):
  // start the title at the last known-brand or ALL-CAPS short line that still leaves a product name below it
  if (title.length >= 3) {
    for (let i = title.length - 2; i >= 1; i--) {
      const l = title[i]
      if (matchBrand(l) || (l === l.toUpperCase() && /[A-Z]{2}/.test(l) && l.split(' ').length <= 4)) { title = title.slice(i); break }
    }
  }
  title = title.slice(0, 4)
  if (!title.length) return null

  let brand: string | null = null
  let name: string | null = null
  const hit = matchBrand(title[0])
  if (hit && hit.rest && !/^by\b/i.test(hit.rest)) {
    // brand and product on one line: "Maybelline New York SuperStay …"
    brand = hit.brand
    name = [hit.rest, ...title.slice(1, 3)].join(' ')
  } else if (title.length >= 2) {
    // brand on its own line, product below (Sephora, Ulta, most stores)
    brand = hit && !hit.rest ? hit.brand : prettyBrand(title[0])
    name = title.slice(1, 4).join(' ')
  } else if (hit) {
    brand = hit.rest ? title[0] : hit.brand // "ONE/SIZE by Patrick Starrr" alone on a line → that's the brand
  } else {
    name = title[0]
  }
  name = name?.replace(/,\s*$/, '') || null

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

/** If a block holds several known-brand title lines (items without prices), split it at each of them */
function splitAtBrands(block: string[]): string[][] {
  const cuts = block
    .map((l, i) => (i > 0 && isTitle(l) && !isTitle(block[i - 1]) && matchBrand(l) ? i : -1))
    .filter(i => i > 0)
  if (!cuts.length) return [block]
  const out: string[][] = []
  let from = 0
  for (const c of cuts) { out.push(block.slice(from, c)); from = c }
  out.push(block.slice(from))
  return out
}

const isPriceLine = (l: string) => prices(l).length > 0 && !NOISE.test(l) && !TOTALS.test(l)
/** A second price right below the first: struck-through original, or "List: $12.99" / "Was $25" */
const isPriceOnly = (l: string) =>
  prices(l).length > 0 && (/^[\s$\d.,:]+$/.test(l) || /^(list|was|reg\.?|regular|original|compare at|msrp|retail)\b/i.test(l))

/** `fullText` (optional) is unfiltered OCR text, used only to detect the store. */
export function parseReceipt(text: string, fullText = text): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
  const all = `${fullText}\n${text}`
  const channel = CHANNELS.find(([re]) => re.test(all))?.[1]
    // Sephora's app never prints its own name on order pages, but these are tell-tale
    ?? (/add to basket|beauty insider/i.test(all) || /\bITEM \d{7}\b/.test(all) ? 'Sephora' : null)

  // Cut off everything after the order totals
  const end = lines.findIndex(l => TOTALS.test(l))
  const body = end >= 0 ? lines.slice(0, end) : lines

  // Each product ends at its price line (plus a struck-through price right after it, if any)
  const blocks: string[][] = []
  let from = 0
  for (let i = 0; i < body.length; i++) {
    if (!isPriceLine(body[i])) continue
    let j = i
    while (j + 1 < body.length && isPriceOnly(body[j + 1])) j++
    blocks.push(body.slice(from, j + 1))
    from = j + 1
    i = j
  }
  const tail = body.slice(from)
  // A product cut off at the bottom of the screenshot (no price) still counts if it has a color/size line
  if (!blocks.length || tail.some(l => SHADE_RE.test(l) || /^size\b/i.test(l))) blocks.push(tail)

  const items = blocks
    .flatMap(splitAtBrands)
    // drop header-only pieces ("ULTA BEAUTY / Your Bag (2)") that have no color/size/price at all
    .filter((b, _, all) => all.length === 1 || b.some(isDetail))
    .map(draftFrom)
    .filter((d): d is DraftItem => d !== null)

  return { channel, items }
}
