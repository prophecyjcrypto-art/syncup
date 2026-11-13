import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n'
import { formatLongDate, formatTime, parseISODate, toISODateString } from '../lib/dates'
import { rangesOverlap, type SessionRange } from '../lib/sessions'
import {
  SLOT_STEP,
  durationHours,
  fitDuration,
  formatClock,
  indexForHour,
  moveHourRange,
  rangeFromCellIndexes,
  resizeHourRange,
  resizeToCell,
  roundHour,
  type HourRange,
} from '../lib/timeRange'
import { textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { Language, TimeSlot } from '../types'
import type { MarkFilter, OverlapCell } from '../lib/schedule'

export type { SessionRange }

type HeatDrag =
  | { kind: 'create'; id: string; iso: string; origin: number }
  | { kind: 'move'; origin: number; range: SessionRange }
  | { kind: 'resize-start'; range: SessionRange }
  | { kind: 'resize-end'; range: SessionRange }

interface HeatDay {
  iso: string
  cells: OverlapCell[]
}

interface Preview {
  block: SessionRange
  sourceId: string | null
}

/** Measure day columns, not every cell. A block covers the cells underneath, and reading each cell forced a layout on every move. */
function cellFromPoint(x: number, y: number, root: HTMLElement): { iso: string; index: number } | null {
  const columns = [...root.querySelectorAll<HTMLElement>('.heat-col')]
  if (columns.length === 0) return null
  const sample = columns[0].querySelector<HTMLElement>('[data-slot="0"]')
  const next = columns[0].querySelector<HTMLElement>('[data-slot="1"]')
  if (!sample) return null
  const sampleRect = sample.getBoundingClientRect()
  const pitch = next ? next.getBoundingClientRect().top - sampleRect.top : sampleRect.height
  if (pitch <= 0) return null
  const count = columns[0].querySelectorAll('[data-slot]').length
  let best: { iso: string; index: number } | null = null
  let bestDist = 64 ** 2
  for (const column of columns) {
    const rect = column.getBoundingClientRect()
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    const dist = dx * dx + dy * dy
    if (dist > bestDist) continue
    let index = Math.floor((y - sampleRect.top) / pitch)
    if (index < 0) index = 0
    if (count > 0 && index > count - 1) index = count - 1
    bestDist = dist
    best = { iso: column.dataset.day ?? '', index }
  }
  return best?.iso ? best : null
}

function fallbackCell(drag: HeatDrag, windowStart: number): { iso: string; index: number } {
  if (drag.kind === 'create') return { iso: drag.iso, index: drag.origin }
  if (drag.kind === 'move') return { iso: drag.range.iso, index: drag.origin }
  if (drag.kind === 'resize-end') return { iso: drag.range.iso, index: indexForHour(drag.range.endHour, windowStart) - 1 }
  return { iso: drag.range.iso, index: indexForHour(drag.range.startHour, windowStart) }
}

function blockFromDrag(
  drag: HeatDrag,
  index: number,
  iso: string,
  windowStart: number,
  windowEnd: number,
  duration: number | null,
): SessionRange {
  if (drag.kind === 'create' && index === drag.origin && duration != null && duration > SLOT_STEP) {
    const start = roundHour(windowStart + drag.origin * SLOT_STEP)
    return { id: drag.id, iso: drag.iso, ...fitDuration({ startHour: start, endHour: start }, duration, windowStart, windowEnd) }
  }
  if (drag.kind === 'create') return { id: drag.id, iso: drag.iso, ...rangeFromCellIndexes(windowStart, drag.origin, index) }
  if (drag.kind === 'move') return { ...drag.range, iso, ...moveHourRange(drag.range, index - drag.origin, windowStart, windowEnd) }
  if (drag.kind === 'resize-end') return { ...drag.range, ...resizeToCell('end', index, drag.range, windowStart, windowEnd) }
  return { ...drag.range, ...resizeToCell('start', index, drag.range, windowStart, windowEnd) }
}

function sourceIdOf(drag: HeatDrag): string | null {
  return drag.kind === 'create' ? null : drag.range.id
}

export function sessionSummary(range: HourRange | null, lang: Language): string {
  if (!range) return t(lang, 'range_empty')
  return `${formatClock(range.startHour)}–${formatClock(range.endHour)} · ${durationHours(range)} ${t(lang, 'hours_unit')}`
}

export function slotMatchesSession(slot: TimeSlot, session: SessionRange): boolean {
  const iso = toISODateString(slot.start)
  if (iso !== session.iso) return false
  const midnight = parseISODate(session.iso).getTime()
  const startHour = roundHour((slot.start.getTime() - midnight) / 3600000)
  const endHour = roundHour((slot.end.getTime() - midnight) / 3600000)
  return startHour === session.startHour && endHour === session.endHour
}

function scoreTone(score: number, isDarkMode: boolean, mode: MarkFilter): string {
  if (mode === 'na') {
    if (score >= 70) return 'bg-[#f19ba8] text-white'
    if (score >= 40) return isDarkMode ? 'bg-[#f19ba8]/40 text-white' : 'bg-[#f19ba8]/30 text-zinc-800'
    if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
    return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
  }
  if (score >= 90) return 'bg-[#7c7bb9] text-white'
  if (score >= 70) return 'bg-[#93ba8c] text-white'
  if (score >= 50) return 'bg-[#f6cf7a] text-zinc-900'
  if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
  return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
}

function hourAttr(windowStart: number, index: number): string {
  return String(roundHour(windowStart + index * SLOT_STEP))
}

function hiddenSession(item: SessionRange, preview: Preview | null): boolean {
  if (!preview) return false
  if (preview.sourceId) return item.id === preview.sourceId
  return item.iso === preview.block.iso && rangesOverlap(item, preview.block)
}

export function HeatBook({
  lang,
  isDarkMode,
  dancers,
  heat,
  slots,
  savedSlots,
  sessions,
  focusId,
  markFilter,
  durationHours: chosenHours,
  editable,
  canPin,
  windowStart,
  windowEnd,
  nameOf,
  onCommit,
  onFocus,
  onToggleDay,
  onRemove,
  onClearAll,
  onToggleSaved,
}: {
  lang: Language
  isDarkMode: boolean
  dancers: { id: string; name: string }[]
  heat: HeatDay[]
  slots: TimeSlot[]
  savedSlots: string[]
  sessions: SessionRange[]
  focusId: string | null
  markFilter: MarkFilter
  durationHours: number | null
  editable: boolean
  canPin: boolean
  windowStart: number
  windowEnd: number
  nameOf: (id: string) => string
  onCommit: (block: SessionRange, sourceId: string | null) => void
  onFocus: (id: string) => void
  onToggleDay: (iso: string) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onToggleSaved: (keys: string[]) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HeatDrag | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const focused = sessions.find((item) => item.id === focusId) ?? sessions[0] ?? null
  const shown = preview?.block ?? focused

  useEffect(() => {
    const scroller = scrollRef.current
    const block = gridRef.current?.querySelector<HTMLElement>('[data-focused]')
    if (!scroller || !block) return
    const s = scroller.getBoundingClientRect()
    const b = block.getBoundingClientRect()
    if (b.left < s.left + 60) scroller.scrollLeft -= s.left + 60 - b.left
    else if (b.right > s.right - 8) scroller.scrollLeft += b.right - (s.right - 8)
    if (b.top < s.top) scroller.scrollTop -= s.top - b.top
    else if (b.bottom > s.bottom) scroller.scrollTop += b.bottom - s.bottom
  }, [focused?.id, focused?.iso, focused?.startHour, focused?.endHour])

  const summary = sessionSummary(shown, lang)
  const heatHelp = [
    t(lang, 'heat_hint'),
    t(lang, 'drag_hint').replace(/^[^。.]*[。.]\s*/, '').trim(),
    sessions.length > 0 ? t(lang, 'multi_day_hint') : '',
  ]
    .filter(Boolean)
    .join('\n')
  const header = heat[0]?.cells ?? []
  const cols = header.length
  const chosenSlots = sessions
    .map((item) => slots.find((slot) => slotMatchesSession(slot, item)) ?? null)
    .filter((slot): slot is TimeSlot => slot != null)
  const matching = !preview && focused ? slots.find((slot) => slotMatchesSession(slot, focused)) ?? null : null
  const saved = chosenSlots.length > 0 && chosenSlots.every((slot) => savedSlots.includes(slot.start.toISOString()))
  const countLabel = markFilter === 'na' ? 'heat_na' : markFilter === 'ok' ? 'heat_ok' : 'heat_free'

  function maybeScroll(clientX: number, clientY: number) {
    const scroller = scrollRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    if (clientY < rect.top + 28) scroller.scrollTop -= 12
    else if (clientY > rect.bottom - 28) scroller.scrollTop += 12
    if (clientX < rect.left + 52) scroller.scrollLeft -= 16
    else if (clientX > rect.right - 28) scroller.scrollLeft += 16
  }

  function publish(drag: HeatDrag, iso: string, index: number, duration: number | null) {
    const block = blockFromDrag(drag, index, iso, windowStart, windowEnd, duration)
    const sourceId = sourceIdOf(drag)
    setPreview((current) => {
      if (
        current &&
        current.sourceId === sourceId &&
        current.block.id === block.id &&
        current.block.iso === block.iso &&
        current.block.startHour === block.startHour &&
        current.block.endHour === block.endHour
      ) {
        return current
      }
      return { block, sourceId }
    })
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || event.button !== 0 || !gridRef.current) return
    const target = event.target as Element
    if (target.closest('[data-day-label], [data-time-label]')) return
    const hit = cellFromPoint(event.clientX, event.clientY, gridRef.current)
    const edge = target.closest('[data-edge]')
    const edgeName = edge instanceof HTMLElement ? edge.dataset.edge : null
    const booked = target.closest('[data-booked]')
    const bookedId = booked instanceof HTMLElement ? booked.dataset.sessionId : null
    const grabbed = sessions.find((item) => item.id === bookedId) ?? null
    let drag: HeatDrag | null = null
    if (focused && edgeName === 'start') drag = { kind: 'resize-start', range: focused }
    else if (focused && edgeName === 'end') drag = { kind: 'resize-end', range: focused }
    else if (grabbed && hit) drag = { kind: 'move', origin: hit.index, range: grabbed }
    else if (hit) drag = { kind: 'create', id: crypto.randomUUID(), iso: hit.iso, origin: hit.index }
    if (!drag) return
    event.preventDefault()
    try {
      gridRef.current.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointers cannot be captured. Later moves still update the block.
    }
    dragRef.current = drag
    const seed = hit ?? fallbackCell(drag, windowStart)
    publish(drag, seed.iso, seed.index, null)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || !gridRef.current) return
    maybeScroll(event.clientX, event.clientY)
    const hit = cellFromPoint(event.clientX, event.clientY, gridRef.current)
    if (!hit) return
    publish(drag, hit.iso, hit.index, null)
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !gridRef.current) return
    const hit = cellFromPoint(event.clientX, event.clientY, gridRef.current) ?? fallbackCell(drag, windowStart)
    const block = blockFromDrag(drag, hit.index, hit.iso, windowStart, windowEnd, chosenHours)
    setPreview(null)
    if (
      drag.kind !== 'create' &&
      block.iso === drag.range.iso &&
      block.startHour === drag.range.startHour &&
      block.endHour === drag.range.endHour
    ) {
      onFocus(drag.range.id)
    } else {
      onCommit(block, sourceIdOf(drag))
    }
    scrollRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!editable) return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      if (focused) onRemove(focused.id)
      return
    }
    const plainDayMove = (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && !event.altKey
    if (plainDayMove) {
      event.preventDefault()
      if (!focused) return
      const dir = event.key === 'ArrowRight' ? 1 : -1
      const index = heat.findIndex((day) => day.iso === focused.iso)
      const next = heat[index + dir]
      if (!next) return
      onCommit({ ...focused, iso: next.iso }, focused.id)
      return
    }
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    if (!forward && !back && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (!focused) {
      const iso = heat[0]?.iso
      if (!iso) return
      onCommit({ id: crypto.randomUUID(), iso, ...rangeFromCellIndexes(windowStart, 0, 0) }, null)
      return
    }
    const write = (block: HourRange) => onCommit({ ...focused, ...block }, focused.id)
    if (event.key === 'Home') {
      write(moveHourRange(focused, -999, windowStart, windowEnd))
      return
    }
    if (event.key === 'End') {
      write(moveHourRange(focused, 999, windowStart, windowEnd))
      return
    }
    const delta = forward ? 1 : -1
    if (event.altKey) write(resizeHourRange(focused, 'start', delta, windowStart, windowEnd))
    else if (event.shiftKey) write(resizeHourRange(focused, 'end', delta, windowStart, windowEnd))
    else write(moveHourRange(focused, delta, windowStart, windowEnd))
  }

  let detail: ReactNode = null
  if (shown) {
    const when = `${formatLongDate(parseISODate(shown.iso), lang)} · ${summary}`
    detail = (
      <div className="space-y-2">
        <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>{when}</p>
        {matching ? (
          <p className={`text-xs ${textMuted(isDarkMode)}`}>
            {t(lang, 'heat_free', { n: matching.availableMembers.length, total: dancers.length })}
            {matching.availableMembers.length > 0 ? ` · ${matching.availableMembers.map(nameOf).join(', ')}` : ''}
            {` · ${formatTime(matching.start, lang)} – ${formatTime(matching.end, lang)}`}
          </p>
        ) : preview ? null : chosenHours == null ? (
          <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'choose_length_first')}</p>
        ) : (
          <p className="text-xs text-[#f19ba8]">{t(lang, 'slot_blocked')}</p>
        )}
        {chosenSlots.length > 0 && canPin ? (
          <button
            type="button"
            onClick={() => onToggleSaved(chosenSlots.map((slot) => slot.start.toISOString()))}
            className="min-h-11 rounded-full btn-glow bg-[#7c7bb9] px-4 text-xs font-bold text-white"
          >
            {saved ? t(lang, 'on_shortlist') : chosenSlots.length > 1 ? t(lang, 'use_these_times') : t(lang, 'use_this_time')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className={`inline-flex items-center gap-2 font-bold ${textPrimary(isDarkMode)}`}>
            {t(lang, 'heat_title')}
            <InfoTip lang={lang} name="heat" text={heatHelp} />
          </h4>
        </div>
      </div>
      {dancers.length === 0 ? (
        <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>
      ) : cols === 0 ? null : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-range-summary="" aria-live="polite">
              {summary}
              {sessions.length > 1 ? ` · ${t(lang, 'slots_picked', { n: sessions.length })}` : ''}
            </p>
            {editable && focused ? (
              <div className="flex shrink-0 gap-2">
                <button type="button" data-remove-session="" onClick={() => onRemove(focused.id)} className={`min-h-11 text-xs font-bold ${textMuted(isDarkMode)}`}>
                  {t(lang, 'clear_range')}
                </button>
                {sessions.length > 1 ? (
                  <button type="button" onClick={onClearAll} className="min-h-11 text-xs font-bold text-[#f19ba8]">
                    {t(lang, 'clear_all')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            ref={scrollRef}
            className="heat-scroll custom-scrollbar focus-visible:ring-2 focus-visible:ring-[#7c7bb9]"
            data-slot-grid=""
            role="grid"
            tabIndex={editable ? 0 : -1}
            aria-label={t(lang, 'heat_title')}
            onKeyDown={onKeyDown}
          >
            <div
              ref={gridRef}
              className="heat-sheet"
              style={{ gridTemplateColumns: `3.35rem repeat(${heat.length}, minmax(5.1rem, 1fr))`, gridTemplateRows: `auto repeat(${cols}, 2.25rem)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finish}
              onPointerCancel={finish}
            >
              <span className="heat-gutter" data-time-label="" style={{ gridColumn: 1, gridRow: 1 }} />
              {heat.map((day, dayIndex) => {
                const picked = sessions.some((item) => item.iso === day.iso) || preview?.block.iso === day.iso
                const label = formatLongDate(parseISODate(day.iso), lang)
                const place = { gridColumn: dayIndex + 2, gridRow: 1 }
                return editable ? (
                  <button
                    key={day.iso}
                    type="button"
                    data-day-label=""
                    data-day-toggle={day.iso}
                    data-selected-day={picked ? '' : undefined}
                    aria-pressed={picked}
                    disabled={sessions.length === 0 && !preview}
                    onClick={() => onToggleDay(day.iso)}
                    className={`heat-day ${picked ? 'heat-day-on' : textPrimary(isDarkMode)}`}
                    style={place}
                  >
                    {label}
                  </button>
                ) : (
                  <span key={day.iso} className={`heat-day ${picked ? 'heat-day-on' : textPrimary(isDarkMode)}`} data-day-label="" style={place}>
                    {label}
                  </span>
                )
              })}
              {header.map((cell, index) => (
                <span key={cell.start.toISOString()} className="heat-time" data-time-label="" style={{ gridColumn: 1, gridRow: index + 2 }}>
                  {formatClock(roundHour(windowStart + index * SLOT_STEP))}
                </span>
              ))}
              {heat.map((day, dayIndex) => {
                const blocks = [
                  ...sessions.filter((item) => item.iso === day.iso && !hiddenSession(item, preview)),
                  ...(preview?.block.iso === day.iso ? [preview.block] : []),
                ]
                return (
                  <div key={day.iso} className="heat-col" data-day={day.iso} style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${cols}` }}>
                    {day.cells.map((cell, index) => {
                        const ratio = dancers.length === 0 ? 0 : (cell.freeIds.length / dancers.length) * 100
                        const pinned = slots.some((slot) => {
                          if (!savedSlots.includes(slot.start.toISOString())) return false
                          return cell.start.getTime() >= slot.start.getTime() && cell.start.getTime() < slot.end.getTime()
                        })
                        return (
                          <div
                            key={cell.start.toISOString()}
                            role="gridcell"
                            data-slot={index}
                            data-day={day.iso}
                            data-hour={hourAttr(windowStart, index)}
                            title={`${formatTime(cell.start, lang)} · ${t(lang, countLabel, { n: cell.freeIds.length, total: dancers.length })}`}
                            aria-label={`${formatLongDate(cell.start, lang)} ${formatTime(cell.start, lang)} ${t(lang, countLabel, { n: cell.freeIds.length, total: dancers.length })}`}
                            className={`heat-cell ${scoreTone(ratio, isDarkMode, markFilter)} ${pinned ? 'heat-cell-pinned' : ''}`}
                          >
                            {cell.freeIds.length}
                          </div>
                        )
                      })}
                      {blocks.map((block) => {
                        const startIndex = indexForHour(block.startHour, windowStart)
                        const endIndex = indexForHour(block.endHour, windowStart)
                        const span = endIndex - startIndex
                        if (span <= 0) return null
                        const isFocus = preview ? block.id === preview.block.id : block.id === focused?.id
                        return (
                          <div
                            key={block.id}
                            data-booked=""
                            data-session-id={block.id}
                            data-booked-iso={block.iso}
                            data-day={block.iso}
                            data-focused={isFocus ? '' : undefined}
                            className={`heat-block ${isFocus ? 'heat-block-focus' : ''}`}
                            style={{
                              top: `calc(${startIndex} * (2.25rem + 2px))`,
                              height: `calc(${span} * 2.25rem + ${Math.max(span - 1, 0) * 2}px)`,
                              zIndex: isFocus ? 3 : 2,
                            }}
                          >
                            {isFocus ? <span data-edge="start" className="heat-edge heat-edge-start" aria-label={t(lang, 'drag_hint')} /> : null}
                            <span className="heat-block-label">
                              {formatClock(block.startHour)}–{formatClock(block.endHour)}
                              <br />
                              {durationHours(block)} {t(lang, 'hours_unit')}
                            </span>
                            {isFocus ? <span data-edge="end" className="heat-edge heat-edge-end" aria-label={t(lang, 'drag_hint')} /> : null}
                          </div>
                        )
                      })}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      {detail}
    </div>
  )
}
