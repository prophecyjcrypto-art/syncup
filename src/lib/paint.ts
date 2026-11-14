import type { BlockKind, TimeBlock } from '../types'
import { makeBlock, sortBlocks } from './blocks'
import { toISODateString } from './dates'
import { roundHour, SLOT_STEP, slotCount } from './timeRange'

export interface PaintSpan {
  iso: string
  startHour: number
  endHour: number
  kind: BlockKind
}

export interface PaintCell {
  iso: string
  index: number
  header: boolean
}

interface Slice {
  start: number
  end: number
  kind: BlockKind
}

function hourOf(date: Date): number {
  return roundHour(date.getHours() + date.getMinutes() / 60)
}

function mergeSlice(slices: Slice[], start: number, end: number, kind: BlockKind): Slice[] {
  const cut: Slice[] = []
  for (const slice of slices) {
    if (slice.end <= start || slice.start >= end) {
      cut.push(slice)
      continue
    }
    if (slice.start < start) cut.push({ ...slice, end: start })
    if (slice.end > end) cut.push({ ...slice, start: end })
  }
  cut.push({ start, end, kind })
  cut.sort((left, right) => left.start - right.start || left.kind.localeCompare(right.kind))
  const merged: Slice[] = []
  for (const slice of cut) {
    const last = merged[merged.length - 1]
    if (last && last.kind === slice.kind && slice.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, slice.end)
    } else {
      merged.push({ ...slice })
    }
  }
  return merged
}

/** Paints one person's blocks. Days that are not in `spans` are returned unchanged. */
export function paintBlocks(blocks: TimeBlock[], spans: PaintSpan[], windowStart: number, windowEnd: number): TimeBlock[] {
  const byDay = new Map<string, PaintSpan[]>()
  for (const span of spans) {
    const start = roundHour(Math.max(windowStart, Math.min(span.startHour, span.endHour)))
    const end = roundHour(Math.min(windowEnd, Math.max(span.startHour, span.endHour)))
    if (!(end > start)) continue
    const list = byDay.get(span.iso) ?? []
    list.push({ iso: span.iso, startHour: start, endHour: end, kind: span.kind })
    byDay.set(span.iso, list)
  }
  if (byDay.size === 0) return blocks
  const next = blocks.filter((block) => !byDay.has(toISODateString(block.start)))
  for (const [iso, daySpans] of byDay) {
    let slices: Slice[] = blocks
      .filter((block) => toISODateString(block.start) === iso)
      .map((block) => ({ start: hourOf(block.start), end: hourOf(block.end), kind: block.kind }))
      .filter((slice) => slice.end > slice.start)
    for (const span of daySpans) slices = mergeSlice(slices, span.startHour, span.endHour, span.kind)
    for (const slice of slices) {
      const wholeDay = slice.start <= windowStart + 1e-6 && slice.end >= windowEnd - 1e-6
      next.push(makeBlock(iso, slice.start, slice.end, slice.kind, wholeDay))
    }
  }
  return sortBlocks(next)
}

/** A drag across the results-style grid, including a drag that starts or ends on a date header. */
export function spansFromDrag(
  origin: PaintCell,
  current: PaintCell,
  days: string[],
  windowStart: number,
  windowEnd: number,
  kind: BlockKind,
): PaintSpan[] {
  const startDay = days.indexOf(origin.iso)
  const endDay = days.indexOf(current.iso)
  if (startDay < 0 || endDay < 0) return []
  const lo = Math.min(startDay, endDay)
  const hi = Math.max(startDay, endDay)
  const count = slotCount(windowStart, windowEnd)
  if (count === 0) return []
  const whole = origin.header || current.header
  const slotLo = whole ? 0 : Math.min(origin.index, current.index)
  const slotHi = whole ? count - 1 : Math.max(origin.index, current.index)
  const startHour = roundHour(windowStart + slotLo * SLOT_STEP)
  const endHour = roundHour(windowStart + (slotHi + 1) * SLOT_STEP)
  const spans: PaintSpan[] = []
  for (let index = lo; index <= hi; index += 1) {
    spans.push({ iso: days[index], startHour, endHour, kind })
  }
  return spans
}
