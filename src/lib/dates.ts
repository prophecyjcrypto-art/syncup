import type { Language } from '../types'

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toISODateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(): string {
  return toISODateString(new Date())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function addDaysISO(iso: string, days: number): string {
  return toISODateString(addDays(parseISODate(iso), days))
}

export function endOfDayISO(isoDate: string): string {
  const date = parseISODate(isoDate)
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

export function setTime(date: Date, hour: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setMinutes(Math.round(hour * 60))
  return next
}

export function getDaysArray(start: Date, end: Date): Date[] {
  const days: Date[] = []
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

export function localeFor(lang: Language): string {
  return lang === 'zh' ? 'zh-TW' : 'en'
}

export function formatDate(date: Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatLongDate(date: Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function formatTime(date: Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatHourOption(hour: number): string {
  const total = Math.round(hour * 60)
  const dayOffset = Math.floor(total / (24 * 60))
  const minutesInDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const rawHour = Math.floor(minutesInDay / 60)
  const minutes = minutesInDay % 60
  const suffix = rawHour >= 12 ? 'PM' : 'AM'
  const display = rawHour % 12 || 12
  const nextDay = dayOffset > 0 ? ' +1' : ''
  return `${display}:${String(minutes).padStart(2, '0')} ${suffix}${nextDay}`
}

export function rangeOptions(min: number, max: number, step = 0.5): number[] {
  const values: number[] = []
  for (let value = min; value <= max + 1e-6; value += step) {
    values.push(Math.round(value * 2) / 2)
  }
  return values
}

export function weekdayLabels(lang: Language): string[] {
  return lang === 'zh'
    ? ['一', '二', '三', '四', '五', '六', '日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
}

export interface MonthGrid {
  key: string
  label: string
  cells: (Date | null)[]
}

export function groupByMonth(days: Date[], lang: Language): MonthGrid[] {
  const groups = new Map<string, Date[]>()
  for (const day of days) {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`
    const list = groups.get(key)
    if (list) list.push(day)
    else groups.set(key, [day])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, list]) => {
      const ordered = [...list].sort((left, right) => left.getTime() - right.getTime())
      const pad = (ordered[0].getDay() + 6) % 7
      const cells: (Date | null)[] = Array.from({ length: pad }, () => null)
      cells.push(...ordered)
      return {
        key,
        label: ordered[0].toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' }),
        cells,
      }
    })
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}
