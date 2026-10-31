import type { Product } from './types'

/** Duplicate detection: same brand + same shade (+ a similar product name). Case/punctuation-insensitive. */

const norm = (s?: string | null) =>
  (s ?? '').toLowerCase().replace(/&/g, 'and').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9一-鿿]+/g, '')

const words = (s?: string | null) =>
  new Set((s ?? '').toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(w => w.length > 2))

function similarNames(a?: string | null, b?: string | null) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return true // one side has no name: decide on brand + shade alone
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const wa = words(a), wb = words(b)
  const common = [...wa].filter(w => wb.has(w)).length
  return common / Math.min(wa.size, wb.size || 1) >= 0.6
}

export interface DupCandidate { brand?: string | null; name?: string | null; shadeName?: string | null }

export function findDuplicate(items: Product[] | null | undefined, c: DupCandidate, excludeId?: string): Product | undefined {
  const brand = norm(c.brand), shade = norm(c.shadeName), name = norm(c.name)
  if (!brand && !name) return undefined
  return (items ?? []).find(p => {
    if (p.id === excludeId) return false
    if (norm(p.brand) !== brand) return false
    const ps = norm(p.shadeName)
    if (shade || ps) {
      // both have a shade: it must match; only one has a shade: require the same product name
      if (shade && ps) return shade === ps && similarNames(p.name, c.name)
      return !!name && norm(p.name) === name
    }
    return similarNames(p.name, c.name) && !!(name || norm(p.name))
  })
}
