// Calendar days are passed around as 'YYYY-MM-DD' strings and all arithmetic
// is done in UTC, so daylight saving changes can never shift a date.

const DAY_MS = 86_400_000

const toMs = (iso: string) => Date.parse(iso + 'T00:00:00Z')

export const isISODate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toMs(value))

export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const addDays = (iso: string, days: number) =>
  new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10)

/** Whole days from `b` to `a` (positive when `a` is later). */
export const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY_MS)

/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7

export const isWeekend = (iso: string) => weekdayIndex(iso) >= 5

/** Shift a 'YYYY-MM' month by a number of months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7)
}

/** Every day shown for a 'YYYY-MM' month, padded to whole Monday-first weeks. */
export function monthGrid(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const lead = weekdayIndex(first)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7
  return Array.from({ length: cells }, (_, i) => addDays(first, i - lead))
}

export const formatDate = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(toMs(iso))

export function formatInterval(days: number): string {
  if (days === 1) return 'Every day'
  if (days === 7) return 'Every week'
  if (days % 7 === 0) return `Every ${days / 7} weeks`
  return `Every ${days} days`
}
