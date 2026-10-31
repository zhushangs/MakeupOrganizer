import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Product } from './types'
import ListPage from './pages/ListPage'
import EditPage from './pages/EditPage'
import ImagePage from './pages/ImagePage'
import ChartPage from './pages/ChartPage'
import ImportPage from './pages/ImportPage'

/** Hash-based routing so the phone's back gesture works */
type Route =
  | { name: 'list'; category?: string }
  | { name: 'new'; category?: string }
  | { name: 'edit'; id: string }
  | { name: 'image'; id: string; isNew: boolean }
  | { name: 'chart'; category: string }
  | { name: 'import' }

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = h.split('?')
  const q = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new', category: q.get('c') ?? undefined }
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] }
  if (parts[0] === 'image' && parts[1]) return { name: 'image', id: parts[1], isNew: q.get('new') === '1' }
  if (parts[0] === 'import') return { name: 'import' }
  if (parts[0] === 'chart') return { name: 'chart', category: q.get('c') ?? 'lipstick' }
  return { name: 'list', category: q.get('c') ?? undefined }
}

export const go = (hash: string) => { location.hash = hash }
/** Navigate without leaving the current page in history (e.g. don't go "back" into a submitted form) */
const replace = (hash: string) => { location.replace('#' + hash) }

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [items, setItems] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setItems(await api.list())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
    const onHash = () => { setRoute(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [reload])

  switch (route.name) {
    case 'list':
      return <ListPage items={items} error={error} category={route.category} onChanged={reload} />
    case 'chart':
      return <ChartPage items={items} category={route.category} />
    case 'import':
      return <ImportPage onSaved={async cat => { await reload(); replace(`/?c=${cat}`) }} />
    case 'new':
      return (
        <EditPage key="new" initialCategory={route.category}
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
    <EditPage key={product.id} existing={product}
      onSaved={async p => { await reload(); replace(`/?c=${p.category}`) }} />
  )
}
