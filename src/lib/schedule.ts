import type { AppConfig, BlockKind, TimeSlot } from '../types'
import { getDaysArray, parseISODate, setTime, toISODateString } from './dates'
import { roundHour, type HourRange } from './timeRange'

export type MarkFilter = 'both' | 'ok' | 'na'

export interface ScheduleBlock {
  start: Date
  end: Date
  kind: BlockKind
}

export interface SchedulePerson {
  id: string
  blocks: ScheduleBlock[]
}

interface Range {
  start: number
  end: number
}

export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: Range[] = []
  for (const range of sorted) {
    if (range.end <= range.start) continue
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) merged.push({ start: range.start, end: range.end })
    else last.end = Math.max(last.end, range.end)
  }
  return merged
}

function clipRanges(ranges: Range[], start: number, end: number): Range[] {
  return mergeRanges(ranges.map((range) => ({ start: Math.max(start, range.start), end: Math.min(end, range.end) })))
}

function subtractRanges(base: Range[], cut: Range[]): Range[] {
  let current = mergeRanges(base)
  for (const piece of mergeRanges(cut)) {
    const next: Range[] = []
    for (const span of current) {
      if (piece.end <= span.start || piece.start >= span.end) {
        next.push(span)
        continue
      }
      if (piece.start > span.start) next.push({ start: span.start, end: piece.start })
      if (piece.end < span.end) next.push({ start: piece.end, end: span.end })
    }
    current = next
  }
  return current
}

export function coveredMs(ranges: Range[]): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start), 0)
}

export function usesBothKinds(blocks: ScheduleBlock[]): boolean {
  let available = false
  let unavailable = false
  for (const block of blocks) {
    if (block.kind === 'available') available = true
    if (block.kind === 'unavailable') unavailable = true
  }
  return available && unavailable
}

/** Days whose daily window is not fully marked. Only applies when both NA and OK exist. */
export function uncoveredDays(config: AppConfig, blocks: ScheduleBlock[]): string[] {
  if (!usesBothKinds(blocks)) return []
  const missing: string[] = []
  for (const day of getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate))) {
    const iso = toISODateString(day)
    const { start, end } = dayWindow(config, iso)
    if (end <= start) continue
    const cover = mergeRanges(
      blocks.map((block) => ({
        start: Math.max(start, block.start.getTime()),
        end: Math.min(end, block.end.getTime()),
      })),
    )
    if (coveredMs(cover) < end - start - 1000) missing.push(iso)
  }
  return missing
}

export function freeIntervals(person: SchedulePerson, start: number, end: number): Range[] {
  if (end <= start) return []
  const window = [{ start, end }]
  const available = person.blocks
    .filter((block) => block.kind === 'available')
    .map((block) => ({ start: block.start.getTime(), end: block.end.getTime() }))
  const unavailable = person.blocks
    .filter((block) => block.kind === 'unavailable')
    .map((block) => ({ start: block.start.getTime(), end: block.end.getTime() }))

  if (available.length === 0 && unavailable.length === 0) return window
  if (available.length === 0) return subtractRanges(window, clipRanges(unavailable, start, end))
  return subtractRanges(clipRanges(available, start, end), clipRanges(unavailable, start, end))
}

export function intersectRanges(left: Range[], right: Range[]): Range[] {
  const overlaps: Range[] = []
  for (const a of left) {
    for (const b of right) {
      const start = Math.max(a.start, b.start)
      const end = Math.min(a.end, b.end)
      if (start < end) overlaps.push({ start, end })
    }
  }
  return mergeRanges(overlaps)
}

/** Positive session length, or null when the organizer has not chosen one yet. */
export function normalizeDurationHours(value: unknown): number | null {
  const hours = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(hours) || hours <= 0) return null
  return hours
}

function dayWindow(config: AppConfig, iso: string): { start: number; end: number } {
  const day = parseISODate(iso)
  return {
    start: setTime(day, config.dayStartHour).getTime(),
    end: setTime(day, config.dayEndHour).getTime(),
  }
}

export function calculateBestSlots(
  config: AppConfig,
  choreographers: SchedulePerson[],
  dancers: SchedulePerson[],
): TimeSlot[] {
  const durationHours = normalizeDurationHours(config.durationHours)
  if (durationHours == null) return []
  const durationMs = durationHours * 60 * 60 * 1000
  const stepMs = 30 * 60 * 1000
  const toleranceMs = config.attendanceTolerance * 60 * 60 * 1000

  const slots: TimeSlot[] = []
  let day = parseISODate(config.startDate)
  const last = parseISODate(config.endDate)

  while (day.getTime() <= last.getTime()) {
    const dayStart = setTime(day, config.dayStartHour).getTime()
    const dayEnd = setTime(day, config.dayEndHour).getTime()

    for (let startMs = dayStart; startMs + durationMs <= dayEnd; startMs += stepMs) {
      const endMs = startMs + durationMs
      const choreographersOk = choreographers.every((person) => {
        return coveredMs(freeIntervals(person, startMs, endMs)) >= durationMs - 1000
      })
      if (!choreographersOk) continue

      const availableMembers: string[] = []
      const partialMembers: TimeSlot['partialMembers'] = []
      const unavailableMembers: TimeSlot['unavailableMembers'] = []
      let totalAttendance = 0

      for (const dancer of dancers) {
        const intervals = freeIntervals(dancer, startMs, endMs)
        const covered = coveredMs(intervals)
        const missing = durationMs - covered
        const availability = Math.min(100, (covered / durationMs) * 100)
        totalAttendance += availability

        if (missing <= 1000) {
          availableMembers.push(dancer.id)
        } else if (missing <= toleranceMs + 1000) {
          const first = intervals[0]?.start
          const lastFree = intervals.length ? intervals[intervals.length - 1].end : undefined
          const lateMins = first !== undefined && first > startMs + 1000 ? Math.ceil((first - startMs) / 60000) : 0
          const earlyMins =
            lastFree !== undefined && lastFree < endMs - 1000 ? Math.ceil((endMs - lastFree) / 60000) : 0
          partialMembers.push({
            id: dancer.id,
            missingMins: Math.ceil(missing / 60000),
            lateMins,
            earlyMins,
          })
        } else {
          unavailableMembers.push({ id: dancer.id, availability: Math.round(availability) })
        }
      }

      slots.push({
        start: new Date(startMs),
        end: new Date(endMs),
        availableMembers,
        partialMembers,
        unavailableMembers,
        attendanceScore: dancers.length > 0 ? Math.round(totalAttendance / dancers.length) : 100,
        score: availableMembers.length + partialMembers.length,
      })
    }

    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  }

  slots.sort(
    (left, right) =>
      right.score - left.score ||
      right.attendanceScore - left.attendanceScore ||
      left.start.getTime() - right.start.getTime(),
  )
  return slots
}

export interface OverlapCell {
  start: Date
  end: Date
  freeIds: string[]
}

function coversMark(person: SchedulePerson, start: number, end: number, mode: MarkFilter): boolean {
  const span = end - start
  if (mode === 'both') return coveredMs(freeIntervals(person, start, end)) >= span - 1000
  const kind: BlockKind = mode === 'ok' ? 'available' : 'unavailable'
  const ranges = person.blocks
    .filter((block) => block.kind === kind)
    .map((block) => ({ start: block.start.getTime(), end: block.end.getTime() }))
  return coveredMs(clipRanges(ranges, start, end)) >= span - 1000
}

/** Half-hour dancer overlap. `both` is the usual schedule. OK and NA count only marked time. */
export function availabilityHeatmap(
  config: AppConfig,
  dancers: SchedulePerson[],
  dates: string[],
  mode: MarkFilter = 'both',
): { iso: string; cells: OverlapCell[] }[] {
  const stepMs = 30 * 60 * 1000
  return dates.map((iso) => {
    const { start, end } = dayWindow(config, iso)
    const cells: OverlapCell[] = []
    for (let cursor = start; cursor + stepMs <= end; cursor += stepMs) {
      const cellEnd = cursor + stepMs
      const freeIds = dancers.filter((person) => coversMark(person, cursor, cellEnd, mode)).map((person) => person.id)
      cells.push({ start: new Date(cursor), end: new Date(cellEnd), freeIds })
    }
    return { iso, cells }
  })
}

export function markedBlockCount(people: SchedulePerson[], kind: BlockKind): number {
  return people.reduce((sum, person) => sum + person.blocks.filter((block) => block.kind === kind).length, 0)
}

export function responseCount(people: SchedulePerson[]): number {
  return people.filter((person) => person.blocks.length > 0).length
}

/** Marked hours inside the event's daily windows. Overlapping marks on one person are merged. */
export function markedHours(config: AppConfig, people: SchedulePerson[], kind: BlockKind): number {
  const days = getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate))
  let ms = 0
  for (const person of people) {
    const ranges = person.blocks
      .filter((block) => block.kind === kind)
      .map((block) => ({ start: block.start.getTime(), end: block.end.getTime() }))
    for (const day of days) {
      const { start, end } = dayWindow(config, toISODateString(day))
      ms += coveredMs(clipRanges(ranges, start, end))
    }
  }
  return Math.round((ms / 3600000) * 10) / 10
}

/** Shortlisted hours when any exist. Otherwise the sessions currently on the grid. Does not write. */
export function plannedSessionHours(duration: number | null, savedSlots: string[], sessions: HourRange[]): number {
  const saved = new Set(savedSlots).size
  if (saved > 0 && duration != null && duration > 0) return roundHour(saved * duration)
  return roundHour(sessions.reduce((sum, session) => sum + (session.endHour - session.startHour), 0))
}

export function sharedFreeByDay(
  config: AppConfig,
  people: SchedulePerson[],
  dates: string[],
): { iso: string; windows: { start: Date; end: Date }[] }[] {
  return dates.map((iso) => {
    const { start, end } = dayWindow(config, iso)
    if (people.length === 0 || end <= start) return { iso, windows: [] }
    let windows = freeIntervals(people[0], start, end)
    for (const person of people.slice(1)) {
      windows = intersectRanges(windows, freeIntervals(person, start, end))
    }
    return {
      iso,
      windows: windows.map((window) => ({ start: new Date(window.start), end: new Date(window.end) })),
    }
  })
}

export interface CompulsoryStatus {
  iso: string
  full: string[]
  partial: string[]
  absent: string[]
}

export function compulsoryReport(
  config: AppConfig,
  people: SchedulePerson[],
  days: string[],
): CompulsoryStatus[] {
  return days.map((iso) => {
    const { start, end } = dayWindow(config, iso)
    const span = end - start
    const full: string[] = []
    const partial: string[] = []
    const absent: string[] = []
    for (const person of people) {
      const covered = span > 0 ? coveredMs(freeIntervals(person, start, end)) : 0
      if (span <= 0 || covered >= span - 1000) full.push(person.id)
      else if (covered <= 1000) absent.push(person.id)
      else partial.push(person.id)
    }
    return { iso, full, partial, absent }
  })
}

export function incompleteCompulsoryDays(config: AppConfig, blocks: ScheduleBlock[], days: string[]): string[] {
  return compulsoryReport(config, [{ id: 'self', blocks }], days)
    .filter((day) => !day.full.includes('self'))
    .map((day) => day.iso)
}
