import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { DEFAULT_CATEGORIES, setCategories, type AppSettings, type Product } from './types'
import { setExtraBrands } from './receipt'
import ListPage from './pages/ListPage'
import EditPage from './pages/EditPage'
import ImagePage from './pages/ImagePage'
import ChartPage from './pages/ChartPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'

/** Hash-based routing so the phone's back gesture works */
type Route =
  | { name: 'list'; category?: string; open?: string }
  | { name: 'new'; category?: string }
  | { name: 'edit'; id: string }
  | { name: 'image'; id: string; isNew: boolean }
  | { name: 'chart'; category: string }
  | { name: 'import' }
  | { name: 'settings' }

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = h.split('?')
  const q = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new', category: q.get('c') ?? undefined }
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] }
  if (parts[0] === 'image' && parts[1]) return { name: 'image', id: parts[1], isNew: q.get('new') === '1' }
  if (parts[0] === 'import') return { name: 'import' }
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'chart') return { name: 'chart', category: q.get('c') ?? 'all' }
  return { name: 'list', category: q.get('c') ?? undefined, open: q.get('open') ?? undefined }
}

export const go = (hash: string) => { location.hash = hash }
/** Navigate without leaving the current page in history (e.g. don't go "back" into a submitted form) */
const replace = (hash: string) => { location.replace('#' + hash) }

/** Brands for autocomplete: the user's own list plus every brand they already own */
export function brandSuggestions(items: Product[] | null, settings: AppSettings) {
  const map = new Map<string, string>()
  for (const b of [...settings.brands, ...(items ?? []).map(p => p.brand)]) {
    const t = b?.trim()
    if (t && !map.has(t.toLowerCase())) map.set(t.toLowerCase(), t)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b))
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [items, setItems] = useState<Product[] | null>(null)
  const [settings, setSettings] = useState<AppSettings>({ categories: DEFAULT_CATEGORIES, brands: [] })
  const [error, setError] = useState<string | null>(null)

  const applySettings = useCallback((s: AppSettings) => {
    setCategories(s.categories)
    setSettings(s)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.list(), api.getSettings()])
      applySettings(s)
      setItems(list)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [applySettings])

  const saveSettings = useCallback(async (s: AppSettings) => applySettings(await api.saveSettings(s)), [applySettings])

  const brands = useMemo(() => brandSuggestions(items, settings), [items, settings])
  useEffect(() => setExtraBrands(brands), [brands])

  useEffect(() => {
    reload()
    const onHash = () => { setRoute(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [reload])

  switch (route.name) {
    case 'list':
      return <ListPage items={items} error={error} category={route.category} openItem={route.open} onChanged={reload} />
    case 'chart':
      return <ChartPage items={items} category={route.category} />
    case 'settings':
      return <SettingsPage items={items} settings={settings} onSave={saveSettings} />
    case 'import':
      return <ImportPage items={items} brands={brands} onSaved={async () => { await reload(); replace('/') }} />
    case 'new':
      return (
        <EditPage key="new" items={items} brands={brands} settings={settings} onSaveSettings={saveSettings}
          initialCategory={route.category}
          onSaved={async p => { await reload(); replace(`/image/${p.id}?new=1`) }} />
      )
  }

  const product = items?.find(i => i.id === route.id)
  if (!product) return <div className="empty">{items ? 'Item not found' : 'Loading…'}</div>

  if (route.name === 'image')
    return (
      <ImagePage key={product.id} product={product} isNew={route.isNew}
        onDone={async p => { await reload(); replace(`/?c=${p.category}`) }} />
    )

  return (
    <EditPage key={product.id} items={items} brands={brands} settings={settings} onSaveSettings={saveSettings}
      existing={product}
      onSaved={async p => { await reload(); replace(`/?c=${p.category}`) }} />
  )
}
