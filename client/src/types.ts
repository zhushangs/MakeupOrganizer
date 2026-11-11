import type { Finish } from './finish'
export interface Swatch {
  hex?: string | null
  label?: string | null
  /** texture: matte (default when missing), satin, shimmer, metallic, glitter */
  finish?: Finish | null
}

export interface Product {
  id: string
  category: string
  brand: string
  name: string
  shadeName?: string | null
  imagePath?: string | null
  /** Where it was bought */
  channel?: string | null
  originalPrice?: number | null
  paidPrice?: number | null
  currency?: string | null
  gridRows: number
  gridCols: number
  /** which pan each grid cell belongs to (pans spanning several cells); null = one pan per cell */
  layout?: number[] | null
  swatches: Swatch[]
  /** clear / colorless product: no color card, the product photo is shown instead */
  noColor?: boolean
  /** marked with a heart: something you like / find works well */
  favorite?: boolean
  notes?: string | null
  /** when it was opened, "YYYY-MM-DD" */
  openedOn?: string | null
  /** good for this many months after opening (the open-jar "12M" symbol) */
  paoMonths?: number | null
  /** batch / lot code printed on the product */
  batchCode?: string | null
  /** manufacture month, "YYYY-MM" (looked up from the batch code) */
  manufacturedOn?: string | null
  createdAt: string
  updatedAt: string
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export interface ImageSearchHit {
  imageUrl: string
  thumbnailUrl?: string | null
  title?: string | null
  source?: string | null
  width?: number | null
  height?: number | null
  /** page the picture is on */
  link?: string | null
  /** 0 brand's own site, 1 Sephora/Ulta, 2 department store, 3 Temptalia, 4 anything else */
  rank?: number
  /** short source name ("Official", "Sephora"…) */
  label?: string | null
}

/**
 * preferred: only the brand's site, Sephora, Ulta, department stores and Temptalia were searched;
 * expanded: those found too little, so everywhere was searched as well; all: searched everywhere
 */
export type SearchScope = 'preferred' | 'expanded' | 'all'
export interface ImageSearchResult { hits: ImageSearchHit[]; scope: SearchScope }

export interface Category {
  key: string
  label: string
  /** Whether this category defaults to a multi-pan grid (eyeshadow palettes) */
  multi: boolean
  defaultRows: number
  defaultCols: number
}

/** Built-in categories; the user can rename, reorder, add and remove them in Settings */
export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'lipstick', label: 'Lipstick', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'lipgloss', label: 'Lip Gloss', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'eyeshadow', label: 'Eyeshadow', multi: true, defaultRows: 3, defaultCols: 3 },
  { key: 'blush', label: 'Blush', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'highlight', label: 'Highlight & Contour', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'base', label: 'Base', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'other', label: 'Other', multi: false, defaultRows: 1, defaultCols: 1 },
]

export interface AppSettings {
  categories: Category[]
  /** Extra brands the user added (for suggestions and screenshot import) */
  brands: string[]
}

// The current category list (loaded from the server's settings at startup)
let categories: Category[] = DEFAULT_CATEGORIES

export const getCategories = () => categories
export function setCategories(list: Category[] | null | undefined) {
  categories = list?.length ? list : DEFAULT_CATEGORIES
}

export const categoryOf = (key: string): Category =>
  categories.find(c => c.key === key)
  ?? categories.find(c => c.key === 'other')
  ?? { key, label: key, multi: false, defaultRows: 1, defaultCols: 1 }

/** Key for a new category: slug of the label, or a random one for labels like "睫毛膏" */
export function newCategoryKey(label: string, taken: string[]) {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!base || base === 'all') base = 'c' + Math.random().toString(36).slice(2, 8)
  let key = base, n = 2
  while (taken.includes(key)) key = `${base}-${n++}`
  return key
}
