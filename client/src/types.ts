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
  swatchImagePath?: string | null
  sourceUrl?: string | null
  channel?: string | null
  price?: number | null
  currency?: string | null
  gridRows: number
  gridCols: number
  swatches: Swatch[]
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export interface ScrapeResult {
  sourceUrl: string
  brand?: string | null
  name?: string | null
  shadeName?: string | null
  price?: number | null
  currency?: string | null
  channel?: string | null
  imagePath?: string | null
  swatchImagePath?: string | null
  colorHex?: string | null
  warnings: string[]
}

export interface Category {
  key: string
  label: string
  /** 默认是否多格（眼影盘） */
  multi: boolean
  defaultRows: number
  defaultCols: number
}

export const CATEGORIES: Category[] = [
  { key: 'lipstick', label: 'Lipstick', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'lipgloss', label: 'Lip Gloss', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'eyeshadow', label: 'Eyeshadow', multi: true, defaultRows: 3, defaultCols: 3 },
  { key: 'blush', label: 'Blush', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'highlight', label: 'Highlight & Contour', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'base', label: 'Base', multi: false, defaultRows: 1, defaultCols: 1 },
  { key: 'other', label: 'Other', multi: false, defaultRows: 1, defaultCols: 1 },
]

export const categoryOf = (key: string) => CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]
