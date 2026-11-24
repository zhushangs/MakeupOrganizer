import { useEffect, useMemo, useRef, useState } from 'react'
import { api, shrinkImage } from '../api'
import { dominantColor } from '../color'
import ColorEditor from '../components/ColorEditor'
import DetailSheet from '../components/DetailSheet'
import FinishLayer from '../components/FinishLayer'
import PaletteGrid from '../components/PaletteGrid'
import { FINISH_LABELS, finishOf } from '../finish'
import { closeness, fillTheGap, matchColor, matchPalette, paletteColors, MATCHED } from '../match'
import { categoriesIn, itemGroup, type ImageSearchHit, type Product } from '../types'
import { go } from '../App'

type Mode = 'one' | 'palette'

/**
 * Find by color: pick a color (or a palette's colors) from a photo, a picture found online,
 * or the color picker, and see which of your own makeup comes closest.
 */
export default function MatchPage({ items, onChanged }: { items: Product[] | null; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('one')
  const [src, setSrc] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [colors, setColors] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ImageSearchHit[] | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<{ mode: Mode; colors: string[]; cats: string[] } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const cats = categoriesIn('makeup')
  const [picked, setPicked] = useState<Record<Mode, string[]>>(() => ({
    one: [], // none = all makeup
    palette: cats.filter(c => c.multi).map(c => c.key),
  }))
  const lookIn = picked[mode]
  const toggleCat = (key: string) => setPicked(p => ({ ...p, [mode]: p[mode].includes(key) ? p[mode].filter(k => k !== key) : [...p[mode], key] }))

  useEffect(() => { api.searchStatus().then(s => setConfigured(s.configured)).catch(() => setConfigured(false)) }, [])

  // a new picture: start from its main color(s)
  useEffect(() => {
    if (!src) return
    let alive = true
    setBusy('reading'); setError(null)
    const job = mode === 'one'
      ? dominantColor(src).then(h => { if (alive && h) setColor(h) })
      : paletteColors(src).then(cs => { if (alive) { setColors(cs); setSel(0) } })
    job.catch(() => alive && setError("Couldn't read colors from this picture.")).finally(() => alive && setBusy(null))
    return () => { alive = false }
  }, [src, mode])

  // a photo from the phone stays on the phone (nothing is uploaded)
  const onFile = async (f?: File) => {
    if (!f) return
    const blob = await shrinkImage(f, 1200)
    setSrc(URL.createObjectURL(blob)); setSearchOpen(false)
  }
  const search = async () => {
    if (!query.trim()) return
    setBusy('search'); setError(null)
    try { setHits((await api.searchImages(query.trim(), null, true)).hits) }
    catch (e) { setError((e as Error).message || 'Search failed') }
    finally { setBusy(null) }
  }
  // pictures from the web are copied to our own storage first, so the canvas may read their pixels
  const pickHit = async (h: ImageSearchHit) => {
    setBusy(h.imageUrl); setError(null)
    try { setSrc(await api.saveImageFromUrl(h.imageUrl, h.thumbnailUrl)); setSearchOpen(false) }
    catch (e) { setError((e as Error).message || "Couldn't use this picture") }
    finally { setBusy(null) }
  }

  const pool = useMemo(() => (items ?? []).filter(p => itemGroup(p) === 'makeup'), [items])
  const inCats = (p: Product, keys: string[]) => !keys.length || keys.includes(p.category)

  const target = mode === 'one' ? (color ? [color] : []) : colors
  const find = () => {
    setShown({ mode, colors: target, cats: lookIn })
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const results = useMemo(() => {
    if (!shown) return null
    const list = pool.filter(p => inCats(p, shown.cats))
    if (shown.mode === 'one') return { one: matchColor(shown.colors[0], list) }
    const pal = matchPalette(shown.colors, list)
    // singles that fill the gap come from every makeup category, not only palettes
    return { pal, gap: fillTheGap(shown.colors, pal[0], pool) }
  }, [shown, pool])

  const open = items?.find(p => p.id === openId)
  const catLabel = (keys: string[]) => (keys.length ? cats.filter(c => keys.includes(c.key)).map(c => c.label).join(', ') : 'All makeup')

  return (
    <div className="app">
      <div className="page-head">
        <button className="link-btn" onClick={() => (history.length > 1 ? history.back() : go('/'))}>‹ Back</button>
        <h2>Find by color</h2>
        <span style={{ width: 48 }} />
      </div>

      <div className="form">
        <div className="card">
          <div className="seg match-mode">
            <button type="button" className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>One color</button>
            <button type="button" className={mode === 'palette' ? 'on' : ''} onClick={() => setMode('palette')}>Palette</button>
          </div>

          <div className="match-src">
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>📷 Photo</button>
            <button type="button" className={'btn small' + (searchOpen ? ' on' : '')} onClick={() => setSearchOpen(v => !v)}>🔍 Search online</button>
            {src && <button type="button" className="btn small" onClick={() => { setSrc(null); setColors([]) }}>Clear picture</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>

          {searchOpen && (
            <div className="match-search">
              {configured === false ? (
                <div className="hint">Online image search isn't set up (no Serper API key). Use a photo or the color picker.</div>
              ) : (
                <>
                  <div className="row">
                    <input className="input" type="search" value={query} placeholder="e.g. Charlotte Tilbury Pillow Talk swatch"
                      onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && search()} />
                    <button className="btn primary" style={{ flex: 'none' }} disabled={busy === 'search' || !query.trim()} onClick={search}>
                      {busy === 'search' ? <span className="spinner" /> : 'Search'}
                    </button>
                  </div>
                  {hits && (
                    <div className="results">
                      {hits.map(h => (
                        <button key={h.imageUrl} className="result" onClick={() => pickHit(h)} disabled={!!busy} title={h.title ?? ''}>
                          <img src={h.thumbnailUrl || h.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          {busy === h.imageUrl && <span className="result-busy"><span className="spinner" /></span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {mode === 'one' && (
            <ColorEditor value={color} images={src ? [{ label: 'Picture', src }] : []}
              hint={src ? 'Drag on the picture to pick the exact spot.' : undefined}
              onChange={hex => setColor(hex)} />
          )}

          {mode === 'palette' && (
            <>
              {busy === 'reading' && <div className="hint"><span className="spinner" /> Reading the colors…</div>}
              <div className="match-colors">
                {colors.map((h, i) => (
                  <button key={i} type="button" className={'mc' + (i === sel ? ' sel' : '')} style={{ background: h }}
                    onClick={() => setSel(i)} aria-label={`Color ${i + 1}: ${h}`} />
                ))}
                {colors.length < 10 && (
                  <button type="button" className="mc add" aria-label="Add a color"
                    onClick={() => { setColors(cs => [...cs, cs[sel] ?? '#c98f7a']); setSel(colors.length) }}>+</button>
                )}
              </div>
              {colors.length > 0 && (
                <>
                  <div className="hint">
                    Color {sel + 1} of {colors.length} is selected: drag on the picture or use the picker to change it.{' '}
                    <button type="button" className="link-btn small" onClick={() => { setColors(cs => cs.filter((_, i) => i !== sel)); setSel(0) }}>Remove it</button>
                  </div>
                  <ColorEditor value={colors[sel]} images={src ? [{ label: 'Picture', src }] : []}
                    onChange={hex => setColors(cs => cs.map((c, i) => (i === sel ? hex : c)))} />
                </>
              )}
              {!src && colors.length === 0 && (
                <div className="hint">Add a photo of the palette (or its swatches) and its main colors are picked out for you. You can also add colors by hand with +.</div>
              )}
            </>
          )}
          {error && <div className="err">{error}</div>}
        </div>

        <div className="field">
          <label>Look in</label>
          <div className="chips" style={{ flexWrap: 'wrap', padding: 0 }}>
            {cats.map(c => (
              <button key={c.key} type="button" className={'chip' + (lookIn.includes(c.key) ? ' on' : '')} onClick={() => toggleCat(c.key)}>{c.label}</button>
            ))}
            <button type="button" className={'chip' + (!lookIn.length ? ' on' : '')} onClick={() => setPicked(p => ({ ...p, [mode]: [] }))}>All makeup</button>
          </div>
        </div>

        <button className="btn primary" disabled={!target.length} onClick={find}>
          {mode === 'one' ? 'Find similar colors' : 'Find similar palettes'}
        </button>

        <div ref={resultsRef} />
        {shown && results && (
          <div className="match-results">
            <div className="match-target">
              {shown.colors.map((h, i) => <span key={i} style={{ background: h }} />)}
              <span className="t">{shown.mode === 'one' ? shown.colors[0] : 'Your colors'} · {catLabel(shown.cats)}</span>
            </div>

            {results.one && (results.one.length ? results.one.map(m => {
              const c = closeness(m.d)
              const fin = finishOf(m.p.swatches[m.pan]?.finish)
              return (
                <button key={m.p.id} className="match-row" onClick={() => setOpenId(m.p.id)}>
                  <span className="pair">
                    <i style={{ background: shown.colors[0] }} />
                    <i style={{ background: m.hex }}><FinishLayer finish={fin} /></i>
                  </span>
                  <span className="info">
                    <span className="lr-brand">{m.p.brand}</span>
                    <span className="mr-name">{m.p.shadeName || m.p.name}</span>
                    <span className="mr-sub">
                      {m.p.shadeName ? m.p.name : ''}{m.p.swatches.length > 1 ? ` · ${m.p.swatches[m.pan]?.label || `pan ${m.pan + 1}`}` : ''}
                      {fin !== 'matte' && <span className="fin-tag">{FINISH_LABELS[fin]}</span>}
                    </span>
                  </span>
                  <span className={'mr-score ' + c.level}>{c.text}<small>ΔE {m.d.toFixed(1)}</small></span>
                </button>
              )
            }) : <div className="empty">Nothing close in {catLabel(shown.cats)}.</div>)}

            {results.pal && (results.pal.length ? results.pal.map(m => (
              <button key={m.p.id} className="match-row" onClick={() => setOpenId(m.p.id)}>
                <span className="mr-pal"><PaletteGrid p={m.p} /></span>
                <span className="info">
                  <span className="lr-brand">{m.p.brand}</span>
                  <span className="mr-name">{m.p.shadeName || m.p.name}</span>
                  <span className="mr-strip">
                    {m.p.swatches.map((s, i) => s.hex && <i key={i} className={m.hitPans.includes(i) ? 'hit' : ''} style={{ background: s.hex }} />)}
                  </span>
                </span>
                <span className={'mr-pct ' + (m.score >= 0.7 ? 'a' : m.score >= 0.55 ? 'b' : 'c')}>
                  {Math.round(m.score * 100)}%<small>{m.matched} of {shown.colors.length} colors</small>
                </span>
              </button>
            )) : <div className="empty">No palette in {catLabel(shown.cats)} looks like this.</div>)}

            {results.gap && results.gap.length > 0 && (
              <>
                <div className="match-sec">Singles that fill the gap</div>
                {results.gap.map(m => {
                  const c = closeness(m.d)
                  return (
                    <button key={m.p.id} className="match-row" onClick={() => setOpenId(m.p.id)}>
                      <span className="pair small"><i style={{ background: m.target }} /><i style={{ background: m.hex }}><FinishLayer finish={m.p.swatches[m.pan]?.finish} /></i></span>
                      <span className="info">
                        <span className="lr-brand">{m.p.brand}</span>
                        <span className="mr-name">{m.p.shadeName || m.p.name}</span>
                      </span>
                      <span className={'mr-score ' + c.level}>{c.text}<small>ΔE {m.d.toFixed(1)}</small></span>
                    </button>
                  )
                })}
              </>
            )}
            {results.pal && <div className="hint" style={{ marginTop: 8 }}>A color counts as matched when the difference is under ΔE {MATCHED}.</div>}
          </div>
        )}
      </div>

      {open && (
        <DetailSheet p={open} onClose={() => setOpenId(null)}
          onDeleted={async () => { setOpenId(null); await onChanged() }} onChanged={onChanged} />
      )}
    </div>
  )
}
