export interface Swatch {
  hex?: string | null
  label?: string | null
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
  swatches: Swatch[]
  notes?: string | null
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
}

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
