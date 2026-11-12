import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { textMuted, textPrimary } from '../lib/ui'
import {
  SLOT_STEP,
  durationHours,
  formatClock,
  indexForHour,
  moveHourRange,
  rangeFromDrag,
  resizeHourRange,
  roundHour,
  slotCount,
  type HourRange,
  type SlotDrag,
} from '../lib/timeRange'
import type { Language } from '../types'

const ROW = '2.25rem'

function indexAt(x: number, y: number, root: HTMLElement): number | null {
  const direct = document.elementFromPoint(x, y)?.closest('[data-slot]')
  if (direct instanceof HTMLElement && root.contains(direct)) return Number(direct.dataset.slot)
  let bestIndex: number | null = null
  let bestDist = 48 ** 2
  for (const cell of root.querySelectorAll<HTMLElement>('[data-slot]')) {
    const rect = cell.getBoundingClientRect()
    const cx = Math.max(rect.left, Math.min(x, rect.right))
    const cy = Math.max(rect.top, Math.min(y, rect.bottom))
    const dist = (cx - x) ** 2 + (cy - y) ** 2
    if (dist <= bestDist) {
      bestDist = dist
      bestIndex = Number(cell.dataset.slot)
    }
  }
  return bestIndex
}

function summaryText(range: HourRange | null, lang: Language): string {
  if (!range) return t(lang, 'range_empty')
  return `${formatClock(range.startHour)}–${formatClock(range.endHour)} · ${durationHours(range)} ${t(lang, 'hours_unit')}`
}

function fallbackIndex(drag: SlotDrag, windowStart: number): number {
  if (drag.kind === 'create' || drag.kind === 'move') return drag.origin
  if (drag.kind === 'resize-end') return indexForHour(drag.range.endHour, windowStart) - 1
  return indexForHour(drag.range.startHour, windowStart)
}

export function TimeSlotGrid({
  windowStart,
  windowEnd,
  value,
  onChange,
  disabled = false,
  lang,
  isDarkMode,
  label,
  allowClear = false,
}: {
  windowStart: number
  windowEnd: number
  value: HourRange | null
  onChange: (range: HourRange | null) => void
  disabled?: boolean
  lang: Language
  isDarkMode: boolean
  label: string
  allowClear?: boolean
}) {
  const helpId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SlotDrag | null>(null)
  const [preview, setPreview] = useState<HourRange | null>(null)
  const shown = preview ?? value
  const count = slotCount(windowStart, windowEnd)
  const summary = summaryText(shown, lang)
  const startIndex = shown ? indexForHour(shown.startHour, windowStart) : 0
  const endIndex = shown ? indexForHour(shown.endHour, windowStart) - 1 : -1

  function maybeScroll(clientY: number) {
    const scroller = scrollRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    if (clientY < rect.top + 36) scroller.scrollTop -= 16
    else if (clientY > rect.bottom - 36) scroller.scrollTop += 16
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !gridRef.current) return
    const target = event.target as Element
    if (target.closest('[data-time-label]')) return
    const index = indexAt(event.clientX, event.clientY, gridRef.current)
    const edge = target.closest('[data-edge]')
    const edgeName = edge instanceof HTMLElement ? edge.dataset.edge : null
    let drag: SlotDrag | null = null
    if (shown && edgeName === 'start') drag = { kind: 'resize-start', range: shown }
    else if (shown && edgeName === 'end') drag = { kind: 'resize-end', range: shown }
    else if (shown && target.closest('[data-booked]') && index != null) drag = { kind: 'move', origin: index, range: shown }
    else if (index != null) drag = { kind: 'create', origin: index }
    if (!drag) return
    event.preventDefault()
    try {
      gridRef.current.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointers cannot be captured. Later moves still update the block.
    }
    dragRef.current = drag
    setPreview(rangeFromDrag(drag, index ?? fallbackIndex(drag, windowStart), windowStart, windowEnd))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || !gridRef.current) return
    maybeScroll(event.clientY)
    const index = indexAt(event.clientX, event.clientY, gridRef.current)
    if (index == null) return
    setPreview(rangeFromDrag(drag, index, windowStart, windowEnd))
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !gridRef.current) return
    const index = indexAt(event.clientX, event.clientY, gridRef.current) ?? fallbackIndex(drag, windowStart)
    setPreview(null)
    onChange(rangeFromDrag(drag, index, windowStart, windowEnd))
    scrollRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (!allowClear) return
      event.preventDefault()
      onChange(null)
      return
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !back && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (!shown) {
      onChange(rangeFromDrag({ kind: 'create', origin: 0 }, 0, windowStart, windowEnd))
      return
    }
    if (event.key === 'Home') {
      onChange(moveHourRange(shown, -999, windowStart, windowEnd))
      return
    }
    if (event.key === 'End') {
      onChange(moveHourRange(shown, 999, windowStart, windowEnd))
      return
    }
    const delta = forward ? 1 : -1
    if (event.altKey) onChange(resizeHourRange(shown, 'start', delta, windowStart, windowEnd))
    else if (event.shiftKey) onChange(resizeHourRange(shown, 'end', delta, windowStart, windowEnd))
    else onChange(moveHourRange(shown, delta, windowStart, windowEnd))
  }

  if (count === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-range-summary aria-live="polite">
          {summary}
        </p>
        {allowClear && shown && (
          <button type="button" onClick={() => onChange(null)} className={`min-h-11 shrink-0 text-xs font-bold ${textMuted(isDarkMode)}`}>
            {t(lang, 'clear_range')}
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="cal-book-scroll custom-scrollbar focus-visible:ring-2 focus-visible:ring-[#7c7bb9]"
        data-slot-grid=""
        role="grid"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
      >
        <div ref={gridRef} className="cal-book-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}>
          {Array.from({ length: count }, (_, index) => {
            const start = roundHour(windowStart + index * SLOT_STEP)
            return (
              <div key={start} role="gridcell" data-slot={index} data-hour={start} className="cal-book-row">
                <span className="cal-book-time" data-time-label="">
                  {formatClock(start)}
                </span>
                <span className="cal-book-cell" />
              </div>
            )
          })}
          {shown && endIndex >= startIndex && (
            <div
              data-booked=""
              className="cal-book-block"
              style={{ top: `calc(${startIndex} * ${ROW})`, height: `calc(${endIndex - startIndex + 1} * ${ROW})` }}
            >
              <span data-edge="start" className="cal-book-handle cal-book-handle-start" aria-label={t(lang, 'drag_hint')} />
              <span className="cal-book-label">{summary}</span>
              <span data-edge="end" className="cal-book-handle cal-book-handle-end" aria-label={t(lang, 'drag_hint')} />
            </div>
          )}
        </div>
      </div>
      <p id={helpId} className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>
        {t(lang, 'drag_hint')}
      </p>
    </div>
  )
}
