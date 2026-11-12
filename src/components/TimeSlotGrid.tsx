import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { textMuted, textPrimary } from '../lib/ui'
import {
  SLOT_STEP,
  cellInRange,
  durationHours,
  formatClock,
  moveHourRange,
  rangeFromDrag,
  resizeHourRange,
  roundHour,
  slotCount,
  type HourRange,
  type SlotDrag,
} from '../lib/timeRange'
import type { Language } from '../types'

function indexAt(x: number, y: number, root: HTMLElement): number | null {
  const direct = document.elementFromPoint(x, y)?.closest('[data-slot]')
  if (direct instanceof HTMLElement && root.contains(direct)) return Number(direct.dataset.slot)
  let bestIndex: number | null = null
  let bestDist = 56 ** 2
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
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Extract<SlotDrag, { kind: 'create' }> | null>(null)
  const [preview, setPreview] = useState<HourRange | null>(null)
  const shown = preview ?? value
  const count = slotCount(windowStart, windowEnd)
  const summary = summaryText(shown, lang)

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !gridRef.current) return
    const cell = (event.target as Element).closest('[data-slot]')
    if (!(cell instanceof HTMLElement) || !gridRef.current.contains(cell)) return
    event.preventDefault()
    try {
      gridRef.current.setPointerCapture(event.pointerId)
    } catch {
      // A real pointer can be captured. Synthetic events still drag via later moves.
    }
    const origin = Number(cell.dataset.slot)
    dragRef.current = { kind: 'create', origin }
    setPreview(rangeFromDrag(dragRef.current, origin, windowStart, windowEnd))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !gridRef.current) return
    const index = indexAt(event.clientX, event.clientY, gridRef.current)
    if (index == null) return
    setPreview(rangeFromDrag(dragRef.current, index, windowStart, windowEnd))
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !gridRef.current) return
    const index = indexAt(event.clientX, event.clientY, gridRef.current) ?? drag.origin
    setPreview(null)
    onChange(rangeFromDrag(drag, index, windowStart, windowEnd))
    gridRef.current.focus()
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
    <div className="space-y-3">
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
        ref={gridRef}
        role="grid"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={helpId}
        data-slot-grid=""
        className={`slot-grid rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#7c7bb9] ${count > 24 ? 'slot-grid-dense' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: count }, (_, index) => {
          const start = roundHour(windowStart + index * SLOT_STEP)
          const selected = shown ? cellInRange(index, shown, windowStart) : false
          return (
            <button
              key={start}
              type="button"
              role="gridcell"
              data-slot={index}
              data-hour={start}
              aria-selected={selected}
              aria-label={`${formatClock(start)}–${formatClock(roundHour(start + SLOT_STEP))}`}
              disabled={disabled}
              className={`slot-cell ${selected ? 'bg-[#7c7bb9] text-white' : `glass-well ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}`}
            >
              {formatClock(start)}
            </button>
          )
        })}
      </div>
      <p id={helpId} className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>
        {t(lang, 'drag_hint')}
      </p>
    </div>
  )
}
