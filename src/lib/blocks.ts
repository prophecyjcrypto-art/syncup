import type { BlockKind, Language, TimeBlock } from '../types'
import { formatLongDate, formatTime, parseISODate, setTime } from './dates'

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
  return [...blocks].sort(
    (left, right) => left.start.getTime() - right.start.getTime() || left.kind.localeCompare(right.kind),
  )
}

export function withBlocks(current: TimeBlock[], extra: TimeBlock[]): TimeBlock[] {
  const next = [...current]
  for (const block of extra) {
    const duplicate = next.some(
      (item) =>
        item.kind === block.kind &&
        item.wholeDay === block.wholeDay &&
        item.start.getTime() === block.start.getTime() &&
        item.end.getTime() === block.end.getTime(),
    )
    if (!duplicate) next.push(block)
  }
  return sortBlocks(next)
}

export function makeBlock(
  iso: string,
  startHour: number,
  endHour: number,
  kind: BlockKind,
  wholeDay: boolean,
): TimeBlock {
  const day = parseISODate(iso)
  return {
    id: crypto.randomUUID(),
    kind,
    start: setTime(day, startHour),
    end: setTime(day, endHour),
    wholeDay,
  }
}

export function formatBlockLabel(block: TimeBlock, lang: Language, wholeDayLabel: string): string {
  const time = block.wholeDay
    ? wholeDayLabel
    : `${formatTime(block.start, lang)} – ${formatTime(block.end, lang)}`
  return `${formatLongDate(block.start, lang)} · ${time}`
}
