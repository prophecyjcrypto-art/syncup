import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n'
import { formatLongDate, formatTime, parseISODate, toISODateString } from '../lib/dates'
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
import type { Language, TimeSlot } from '../types'
import type { OverlapCell } from '../lib/schedule'

export interface SessionRange extends HourRange {
  iso: string
}

type HeatDrag =
  | { kind: 'create'; iso: string; origin: number }
  | { kind: 'move'; origin: number; range: SessionRange }
  | { kind: 'resize-start'; range: SessionRange }
  | { kind: 'resize-end'; range: SessionRange }

interface HeatDay {
  iso: string
  cells: OverlapCell[]
}

function cellAt(x: number, y: number, root: HTMLElement): { iso: string; index: number } | null {
  const direct = document.elementFromPoint(x, y)?.closest('[data-slot]')
  if (direct instanceof HTMLElement && root.contains(direct) && direct.dataset.day) {
    return { iso: direct.dataset.day, index: Number(direct.dataset.slot) }
  }
  let best: { iso: string; index: number } | null = null
  let bestDist = 64 ** 2
  for (const cell of root.querySelectorAll<HTMLElement>('[data-slot]')) {
    if (!cell.dataset.day) continue
    const rect = cell.getBoundingClientRect()
    const cx = Math.max(rect.left, Math.min(x, rect.right))
    const cy = Math.max(rect.top, Math.min(y, rect.bottom))
    const dist = (cx - x) ** 2 + (cy - y) ** 2
    if (dist <= bestDist) {
      bestDist = dist
      best = { iso: cell.dataset.day, index: Number(cell.dataset.slot) }
    }
  }
  return best
}

function fallbackCell(drag: HeatDrag, windowStart: number): { iso: string; index: number } {
  if (drag.kind === 'create') return { iso: drag.iso, index: drag.origin }
  if (drag.kind === 'move') return { iso: drag.range.iso, index: drag.origin }
  if (drag.kind === 'resize-end') return { iso: drag.range.iso, index: indexForHour(drag.range.endHour, windowStart) - 1 }
  return { iso: drag.range.iso, index: indexForHour(drag.range.startHour, windowStart) }
}

function sessionFromDrag(
  drag: HeatDrag,
  index: number,
  iso: string,
  windowStart: number,
  windowEnd: number,
  duration: number | null,
): SessionRange {
  if (drag.kind === 'create' && index === drag.origin && duration != null && duration > SLOT_STEP) {
    const start = roundHour(windowStart + drag.origin * SLOT_STEP)
    return { iso: drag.iso, ...fitDuration({ startHour: start, endHour: start }, duration, windowStart, windowEnd) }
  }
  if (drag.kind === 'create') return { iso: drag.iso, ...rangeFromCellIndexes(windowStart, drag.origin, index) }
  if (drag.kind === 'move') {
    return { iso, ...moveHourRange(drag.range, index - drag.origin, windowStart, windowEnd) }
  }
  if (drag.kind === 'resize-end') return { iso: drag.range.iso, ...resizeToCell('end', index, drag.range, windowStart, windowEnd) }
  return { iso: drag.range.iso, ...resizeToCell('start', index, drag.range, windowStart, windowEnd) }
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

function scoreTone(score: number, isDarkMode: boolean): string {
  if (score >= 90) return 'bg-[#7c7bb9] text-white'
  if (score >= 70) return 'bg-[#93ba8c] text-white'
  if (score >= 50) return 'bg-[#f6cf7a] text-zinc-900'
  if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
  return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
}

function hourAttr(windowStart: number, index: number): string {
  return String(roundHour(windowStart + index * SLOT_STEP))
}

export function HeatBook({
  lang,
  isDarkMode,
  dancers,
  heat,
  slots,
  savedSlots,
  session,
  durationHours: chosenHours,
  editable,
  canPin,
  windowStart,
  windowEnd,
  nameOf,
  onSession,
  onToggleSaved,
}: {
  lang: Language
  isDarkMode: boolean
  dancers: { id: string; name: string }[]
  heat: HeatDay[]
  slots: TimeSlot[]
  savedSlots: string[]
  session: SessionRange | null
  durationHours: number | null
  editable: boolean
  canPin: boolean
  windowStart: number
  windowEnd: number
  nameOf: (id: string) => string
  onSession: (next: SessionRange | null) => void
  onToggleSaved: (key: string) => void
}) {
  const helpId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HeatDrag | null>(null)
  const [preview, setPreview] = useState<SessionRange | null>(null)
  const shown = preview ?? session

  useEffect(() => {
    const scroller = scrollRef.current
    const block = gridRef.current?.querySelector<HTMLElement>('[data-booked]')
    if (!scroller || !block) return
    const s = scroller.getBoundingClientRect()
    const b = block.getBoundingClientRect()
    if (b.left < s.left + 60) scroller.scrollLeft -= s.left + 60 - b.left
    else if (b.right > s.right - 8) scroller.scrollLeft += b.right - (s.right - 8)
    if (b.top < s.top) scroller.scrollTop -= s.top - b.top
    else if (b.bottom > s.bottom) scroller.scrollTop += b.bottom - s.bottom
  }, [session?.iso, session?.startHour, session?.endHour])
  const summary = sessionSummary(shown, lang)
  const header = heat[0]?.cells ?? []
  const cols = header.length
  const matching = session && !preview ? slots.find((slot) => slotMatchesSession(slot, session)) ?? null : null
  const matchingKey = matching ? matching.start.toISOString() : null
  const saved = matchingKey != null && savedSlots.includes(matchingKey)

  function maybeScroll(clientX: number, clientY: number) {
    const scroller = scrollRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    if (clientY < rect.top + 28) scroller.scrollTop -= 12
    else if (clientY > rect.bottom - 28) scroller.scrollTop += 12
    if (clientX < rect.left + 52) scroller.scrollLeft -= 16
    else if (clientX > rect.right - 28) scroller.scrollLeft += 16
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || event.button !== 0 || !gridRef.current) return
    const target = event.target as Element
    if (target.closest('[data-day-label], [data-time-label]')) return
    const hit = cellAt(event.clientX, event.clientY, gridRef.current)
    const edge = target.closest('[data-edge]')
    const edgeName = edge instanceof HTMLElement ? edge.dataset.edge : null
    let drag: HeatDrag | null = null
    if (shown && edgeName === 'start') drag = { kind: 'resize-start', range: shown }
    else if (shown && edgeName === 'end') drag = { kind: 'resize-end', range: shown }
    else if (shown && target.closest('[data-booked]') && hit) drag = { kind: 'move', origin: hit.index, range: shown }
    else if (hit) drag = { kind: 'create', iso: hit.iso, origin: hit.index }
    if (!drag) return
    event.preventDefault()
    try {
      gridRef.current.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointers cannot be captured. Later moves still update the block.
    }
    dragRef.current = drag
    const seed = hit ?? fallbackCell(drag, windowStart)
    setPreview(sessionFromDrag(drag, seed.index, seed.iso, windowStart, windowEnd, null))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || !gridRef.current) return
    maybeScroll(event.clientX, event.clientY)
    const hit = cellAt(event.clientX, event.clientY, gridRef.current)
    if (!hit) return
    setPreview(sessionFromDrag(drag, hit.index, hit.iso, windowStart, windowEnd, null))
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !gridRef.current) return
    const hit = cellAt(event.clientX, event.clientY, gridRef.current) ?? fallbackCell(drag, windowStart)
    setPreview(null)
    onSession(sessionFromDrag(drag, hit.index, hit.iso, windowStart, windowEnd, chosenHours))
    scrollRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!editable) return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      onSession(null)
      return
    }
    const plainDayMove = (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && !event.altKey
    if (plainDayMove) {
      event.preventDefault()
      if (!shown) return
      const dir = event.key === 'ArrowRight' ? 1 : -1
      const index = heat.findIndex((day) => day.iso === shown.iso)
      const next = heat[index + dir]
      if (!next) return
      onSession({ ...shown, iso: next.iso })
      return
    }
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    if (!forward && !back && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (!shown) {
      const iso = heat[0]?.iso
      if (!iso) return
      onSession({ iso, ...rangeFromCellIndexes(windowStart, 0, 0) })
      return
    }
    if (event.key === 'Home') {
      onSession({ ...shown, ...moveHourRange(shown, -999, windowStart, windowEnd) })
      return
    }
    if (event.key === 'End') {
      onSession({ ...shown, ...moveHourRange(shown, 999, windowStart, windowEnd) })
      return
    }
    const delta = forward ? 1 : -1
    if (event.altKey) onSession({ ...shown, ...resizeHourRange(shown, 'start', delta, windowStart, windowEnd) })
    else if (event.shiftKey) onSession({ ...shown, ...resizeHourRange(shown, 'end', delta, windowStart, windowEnd) })
    else onSession({ ...shown, ...moveHourRange(shown, delta, windowStart, windowEnd) })
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
        {matching && canPin ? (
          <button
            type="button"
            onClick={() => onToggleSaved(matchingKey!)}
            className="min-h-11 rounded-full btn-glow bg-[#7c7bb9] px-4 text-xs font-bold text-white"
          >
            {saved ? t(lang, 'on_shortlist') : t(lang, 'use_this_time')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className={`font-bold ${textPrimary(isDarkMode)}`}>{t(lang, 'heat_title')}</h4>
          <p className={`mt-1 text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'heat_hint')}</p>
        </div>
      </div>
      {dancers.length === 0 ? (
        <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>
      ) : cols === 0 ? null : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-range-summary="" aria-live="polite">
              {summary}
            </p>
            {editable && shown ? (
              <button type="button" onClick={() => onSession(null)} className={`min-h-11 shrink-0 text-xs font-bold ${textMuted(isDarkMode)}`}>
                {t(lang, 'clear_range')}
              </button>
            ) : null}
          </div>
          <div
            ref={scrollRef}
            className="heat-scroll custom-scrollbar focus-visible:ring-2 focus-visible:ring-[#7c7bb9]"
            data-slot-grid=""
            role="grid"
            tabIndex={editable ? 0 : -1}
            aria-label={t(lang, 'heat_title')}
            aria-describedby={helpId}
            onKeyDown={onKeyDown}
          >
            <div
              ref={gridRef}
              className="heat-sheet"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finish}
              onPointerCancel={finish}
            >
              <div className="heat-head">
                <span className="heat-gutter" data-time-label="" />
                {heat.map((day) => (
                  <span key={day.iso} className={`heat-day ${textPrimary(isDarkMode)}`} data-day-label="">
                    {formatLongDate(parseISODate(day.iso), lang)}
                  </span>
                ))}
              </div>
              <div className="heat-body">
                <div className="heat-times">
                  {header.map((cell, index) => (
                    <span key={cell.start.toISOString()} className="heat-time" data-time-label="">
                      {formatClock(roundHour(windowStart + index * SLOT_STEP))}
                    </span>
                  ))}
                </div>
                {heat.map((day) => {
                  const blockHere = shown?.iso === day.iso
                  const startIndex = blockHere ? indexForHour(shown.startHour, windowStart) : 0
                  const endIndex = blockHere ? indexForHour(shown.endHour, windowStart) : 0
                  const span = endIndex - startIndex
                  return (
                    <div key={day.iso} className="heat-col" data-day={day.iso}>
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
                            title={`${formatTime(cell.start, lang)} · ${t(lang, 'heat_free', { n: cell.freeIds.length, total: dancers.length })}`}
                            aria-label={`${formatLongDate(cell.start, lang)} ${formatTime(cell.start, lang)} ${t(lang, 'heat_free', { n: cell.freeIds.length, total: dancers.length })}`}
                            className={`heat-cell ${scoreTone(ratio, isDarkMode)} ${pinned ? 'heat-cell-pinned' : ''}`}
                          >
                            {cell.freeIds.length}
                          </div>
                        )
                      })}
                      {blockHere && span > 0 ? (
                        <div
                          data-booked=""
                          className="heat-block"
                          style={{
                            top: `calc(${startIndex} * (2.25rem + 2px))`,
                            height: `calc(${span} * 2.25rem + ${span - 1} * 2px)`,
                          }}
                        >
                          <span data-edge="start" className="heat-edge heat-edge-start" aria-label={t(lang, 'drag_hint')} />
                          <span className="heat-block-label">
                            {formatClock(shown.startHour)}–{formatClock(shown.endHour)}
                            <br />
                            {durationHours(shown)} {t(lang, 'hours_unit')}
                          </span>
                          <span data-edge="end" className="heat-edge heat-edge-end" aria-label={t(lang, 'drag_hint')} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <p id={helpId} className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>
            {t(lang, 'drag_hint')}
          </p>
        </>
      )}
      {detail}
    </div>
  )
}
