import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Product } from './types'
import ListPage from './pages/ListPage'
import EditPage from './pages/EditPage'

/** Hash-based routing so the phone's back gesture works */
type Route =
  | { name: 'list'; category?: string }
  | { name: 'new'; mode: 'link' | 'manual'; category?: string }
  | { name: 'edit'; id: string }

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = h.split('?')
  const q = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new', mode: parts[1] === 'manual' ? 'manual' : 'link', category: q.get('c') ?? undefined }
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] }
  return { name: 'list', category: q.get('c') ?? undefined }
}

export const go = (hash: string) => { location.hash = hash }

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

  if (route.name === 'list')
    return <ListPage items={items} error={error} category={route.category} onChanged={reload} />

  const existing = route.name === 'edit' ? items?.find(i => i.id === route.id) : undefined
  if (route.name === 'edit' && !existing)
    return <div className="empty">{items ? 'Item not found' : 'Loading…'}</div>

  return (
    <EditPage
      key={route.name === 'edit' ? route.id : 'new-' + route.mode}
      existing={existing}
      initialMode={route.name === 'new' ? route.mode : 'manual'}
      initialCategory={route.name === 'new' ? route.category : undefined}
      onSaved={async p => { await reload(); go(`/?c=${p.category}`) }}
    />
  )
}
