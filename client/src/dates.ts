/**
 * Opened date, period after opening (the open-jar "12M" symbol), batch code and manufacture month:
 * formatting and the "use by" / "how old" sums shown in the details.
 */

/** Usual shelf life of an unopened product; older than this gets a gentle warning */
export const UNOPENED_SHELF_MONTHS = 36

/** Choices for "Good for (after opening)", in months */
export const PAO_CHOICES = [3, 6, 9, 12, 18, 24, 36]

/** Batch code lookup site (codes are brand-specific, so we don't decode them ourselves) */
export const BATCH_LOOKUP_URL = 'https://www.checkfresh.com/'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-03-12" or "2026-03" → [year, month 0-11, day] (day 1 when missing); null if malformed */
function parse(s: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s ?? '')
  if (!m) return null
  const mo = +m[2] - 1
  return mo >= 0 && mo < 12 ? [+m[1], mo, m[3] ? +m[3] : 1] : null
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Mar 12, 2026" (a full date) or "Mar 2026" (a month) */
export function formatDate(s: string | null | undefined) {
  const p = parse(s)
  if (!p) return ''
  return /-\d{2}-\d{2}$/.test(s!) ? `${MONTHS[p[1]]} ${p[2]}, ${p[0]}` : `${MONTHS[p[1]]} ${p[0]}`
}

/** Whole months from a to b (negative when b is earlier) */
function monthsBetween(a: [number, number, number], b: [number, number, number]): number {
  const later = b[0] * 10000 + b[1] * 100 + b[2] >= a[0] * 10000 + a[1] * 100 + a[2]
  if (!later) return -monthsBetween(b, a)
  let n = (b[0] - a[0]) * 12 + (b[1] - a[1])
  if (b[2] < a[2]) n -= 1
  return n
}

const nowParts = (): [number, number, number] => {
  const d = new Date()
  return [d.getFullYear(), d.getMonth(), d.getDate()]
}

/** "8 months", "1 year 2 months", "less than a month" */
export function spanText(months: number) {
  const m = Math.abs(months)
  if (m === 0) return 'less than a month'
  const y = Math.floor(m / 12), r = m % 12
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  return [y ? part(y, 'year') : '', r ? part(r, 'month') : ''].filter(Boolean).join(' ')
}

/** How long ago a date was: "8 months ago" (or "today-ish" phrasing for under a month) */
export function agoText(s: string | null | undefined) {
  const p = parse(s)
  if (!p) return ''
  const n = monthsBetween(p, nowParts())
  if (n < 0) return 'in the future'
  return n === 0 ? 'this month' : `${spanText(n)} ago`
}

export type UseBy = { text: string; level: 'ok' | 'soon' | 'past' }

/** Opened date + months after opening → when to stop using it */
export function useBy(openedOn: string | null | undefined, paoMonths: number | null | undefined): UseBy | null {
  const p = parse(openedOn)
  if (!p || !paoMonths) return null
  const end: [number, number, number] = [p[0] + Math.floor((p[1] + paoMonths) / 12), (p[1] + paoMonths) % 12, p[2]]
  const left = monthsBetween(nowParts(), end)
  const when = `${MONTHS[end[1]]} ${end[0]}`
  if (left < 0) return { text: `${when} · expired ${spanText(-left)} ago`, level: 'past' }
  if (left === 0) return { text: `${when} · expires this month`, level: 'soon' }
  return { text: `${when} · ${spanText(left)} left`, level: left <= 1 ? 'soon' : 'ok' }
}

/** Unopened and older than the usual shelf life? */
export function tooOldUnopened(manufacturedOn: string | null | undefined, openedOn: string | null | undefined) {
  const p = parse(manufacturedOn)
  return !!p && !parse(openedOn) && monthsBetween(p, nowParts()) >= UNOPENED_SHELF_MONTHS
}
