/** Half-hour slots. A selected session is a contiguous run of these slots. */

export const SLOT_STEP = 0.5

export interface HourRange {
  startHour: number
  endHour: number
}

export type SlotDrag =
  | { kind: 'create'; origin: number }
  | { kind: 'move'; origin: number; range: HourRange }
  | { kind: 'resize-start'; range: HourRange }
  | { kind: 'resize-end'; range: HourRange }

export function roundHour(value: number, step = SLOT_STEP): number {
  const rounded = Math.round(value / step) * step
  return Math.round(rounded * 1000) / 1000
}

export function slotCount(windowStart: number, windowEnd: number, step = SLOT_STEP): number {
  if (!(windowEnd > windowStart)) return 0
  return Math.max(0, Math.round((windowEnd - windowStart) / step))
}

export function indexForHour(hour: number, windowStart: number, step = SLOT_STEP): number {
  return Math.round((hour - windowStart) / step)
}

/** Inclusive cell indexes become a half-open hour range. The end hour is the end of the last cell. */
export function rangeFromCellIndexes(
  windowStart: number,
  fromIndex: number,
  toIndex: number,
  step = SLOT_STEP,
): HourRange {
  const lo = Math.min(fromIndex, toIndex)
  const hi = Math.max(fromIndex, toIndex)
  return {
    startHour: roundHour(windowStart + lo * step, step),
    endHour: roundHour(windowStart + (hi + 1) * step, step),
  }
}

export function durationHours(range: HourRange, step = SLOT_STEP): number {
  return roundHour(range.endHour - range.startHour, step)
}

export function cellInRange(index: number, range: HourRange, windowStart: number, step = SLOT_STEP): boolean {
  const start = indexForHour(range.startHour, windowStart, step)
  const end = indexForHour(range.endHour, windowStart, step) - 1
  return index >= start && index <= end
}

export function moveHourRange(
  range: HourRange,
  deltaSlots: number,
  windowStart: number,
  windowEnd: number,
  step = SLOT_STEP,
): HourRange {
  const length = durationHours(range, step)
  if (length <= 0 || windowEnd - windowStart < length) {
    return { startHour: windowStart, endHour: roundHour(Math.min(windowEnd, windowStart + Math.max(length, step)), step) }
  }
  const maxStart = roundHour(windowEnd - length, step)
  let start = roundHour(range.startHour + deltaSlots * step, step)
  if (start < windowStart) start = windowStart
  if (start > maxStart) start = maxStart
  return { startHour: start, endHour: roundHour(start + length, step) }
}

export function resizeToCell(
  edge: 'start' | 'end',
  index: number,
  range: HourRange,
  windowStart: number,
  windowEnd: number,
  step = SLOT_STEP,
): HourRange {
  if (edge === 'end') {
    let endHour = roundHour(windowStart + (index + 1) * step, step)
    const minEnd = roundHour(range.startHour + step, step)
    if (endHour < minEnd) endHour = minEnd
    if (endHour > windowEnd) endHour = windowEnd
    return { startHour: range.startHour, endHour }
  }
  let startHour = roundHour(windowStart + index * step, step)
  const maxStart = roundHour(range.endHour - step, step)
  if (startHour > maxStart) startHour = maxStart
  if (startHour < windowStart) startHour = windowStart
  return { startHour, endHour: range.endHour }
}

export function resizeHourRange(
  range: HourRange,
  edge: 'start' | 'end',
  deltaSlots: number,
  windowStart: number,
  windowEnd: number,
  step = SLOT_STEP,
): HourRange {
  if (edge === 'end') {
    const last = indexForHour(range.endHour, windowStart, step) - 1
    return resizeToCell('end', last + deltaSlots, range, windowStart, windowEnd, step)
  }
  const first = indexForHour(range.startHour, windowStart, step)
  return resizeToCell('start', first + deltaSlots, range, windowStart, windowEnd, step)
}

/** Keep the start when the length changes, and slide earlier only if the new end would leave the day. */
export function fitDuration(range: HourRange, hours: number, windowStart: number, windowEnd: number, step = SLOT_STEP): HourRange {
  const span = roundHour(windowEnd - windowStart, step)
  const length = roundHour(Math.min(Math.max(hours, step), Math.max(span, step)), step)
  let start = range.startHour
  let end = roundHour(start + length, step)
  if (end > windowEnd) {
    end = windowEnd
    start = roundHour(end - length, step)
  }
  if (start < windowStart) start = windowStart
  end = roundHour(Math.min(windowEnd, start + length), step)
  if (end <= start) end = roundHour(Math.min(windowEnd, start + step), step)
  return { startHour: start, endHour: end }
}

export function rangeFromDrag(drag: SlotDrag, index: number, windowStart: number, windowEnd: number): HourRange {
  if (drag.kind === 'create') return rangeFromCellIndexes(windowStart, drag.origin, index)
  if (drag.kind === 'move') return moveHourRange(drag.range, index - drag.origin, windowStart, windowEnd)
  if (drag.kind === 'resize-end') return resizeToCell('end', index, drag.range, windowStart, windowEnd)
  return resizeToCell('start', index, drag.range, windowStart, windowEnd)
}

/** 19:00, or 02:00+1 when the hour falls on the next calendar day. */
export function formatClock(hour: number): string {
  const total = Math.round(hour * 60)
  const dayOffset = Math.floor(total / (24 * 60))
  const minutesInDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(minutesInDay / 60)
  const m = minutesInDay % 60
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return dayOffset > 0 ? `${label}+1` : label
}

/** Accepts 19:00, 21:30, and 02:00+1. Returns null when the text is not a time. */
export function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(\s*\+1)?$/i)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null
  return h + m / 60 + (match[3] ? 24 : 0)
}

export function durationFromCellCount(cells: number, step = SLOT_STEP): number {
  return roundHour(Math.max(0, cells) * step, step)
}
