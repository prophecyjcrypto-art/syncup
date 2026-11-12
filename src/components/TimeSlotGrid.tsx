import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { inputClass, textMuted, textPrimary } from '../lib/ui'
import {
  SLOT_STEP,
  cellInRange,
  durationFromCellCount,
  durationHours,
  formatClock,
  indexForHour,
  parseClock,
  rangeFromDrag,
  resizeHourRange,
  roundHour,
  slotCount,
  moveHourRange,
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
  const dragRef = useRef<SlotDrag | null>(null)
  const startInput = useRef<HTMLInputElement>(null)
  const endInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<HourRange | null>(null)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [preciseNote, setPreciseNote] = useState('')
  const shown = preview ?? value
  const count = slotCount(windowStart, windowEnd)
  const summary = summaryText(shown, lang)

  useEffect(() => {
    if (document.activeElement === startInput.current || document.activeElement === endInput.current) return
    setStartText(value ? formatClock(value.startHour) : '')
    setEndText(value ? formatClock(value.endHour) : '')
  }, [value])

  function begin(index: number, edge: 'start' | 'end' | null) {
    const multi = value != null && durationHours(value) > SLOT_STEP
    const startIndex = value ? indexForHour(value.startHour, windowStart) : -1
    const endIndex = value ? indexForHour(value.endHour, windowStart) - 1 : -1
    if (value && (edge === 'start' || (multi && index === startIndex))) dragRef.current = { kind: 'resize-start', range: value }
    else if (value && (edge === 'end' || (multi && index === endIndex))) dragRef.current = { kind: 'resize-end', range: value }
    else if (value && multi && cellInRange(index, value, windowStart)) dragRef.current = { kind: 'move', origin: index, range: value }
    else dragRef.current = { kind: 'create', origin: index }
    setPreview(rangeFromDrag(dragRef.current, index, windowStart, windowEnd))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !gridRef.current) return
    const cell = (event.target as Element).closest('[data-slot]')
    if (!(cell instanceof HTMLElement) || !gridRef.current.contains(cell)) return
    event.preventDefault()
    gridRef.current.setPointerCapture(event.pointerId)
    const edgeNode = (event.target as Element).closest('[data-edge]')
    const edge = edgeNode instanceof HTMLElement ? (edgeNode.dataset.edge as 'start' | 'end') : null
    begin(Number(cell.dataset.slot), edge)
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
    const index = indexAt(event.clientX, event.clientY, gridRef.current)
    const origin = drag.kind === 'create' || drag.kind === 'move' ? drag.origin : indexForHour(drag.range.startHour, windowStart)
    const next = rangeFromDrag(drag, index ?? origin, windowStart, windowEnd)
    setPreview(null)
    setPreciseNote('')
    onChange(next)
    gridRef.current.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const key = event.key
    if (key === 'Backspace' || key === 'Delete') {
      if (!allowClear) return
      event.preventDefault()
      onChange(null)
      return
    }
    const horizontal = key === 'ArrowRight' || key === 'ArrowLeft'
    const vertical = key === 'ArrowDown' || key === 'ArrowUp'
    if (!horizontal && !vertical && key !== 'Home' && key !== 'End') return
    event.preventDefault()
    const forward = key === 'ArrowRight' || key === 'ArrowDown'
    if (!shown) {
      onChange(rangeFromDrag({ kind: 'create', origin: 0 }, 0, windowStart, windowEnd))
      return
    }
    if (key === 'Home') {
      onChange(moveHourRange(shown, -999, windowStart, windowEnd))
      return
    }
    if (key === 'End') {
      onChange(moveHourRange(shown, 999, windowStart, windowEnd))
      return
    }
    const delta = forward ? 1 : -1
    if (event.altKey) onChange(resizeHourRange(shown, 'start', delta, windowStart, windowEnd))
    else if (event.shiftKey) onChange(resizeHourRange(shown, 'end', delta, windowStart, windowEnd))
    else onChange(moveHourRange(shown, delta, windowStart, windowEnd))
  }

  function commitPrecise() {
    const start = parseClock(startText)
    const end = parseClock(endText)
    if (start == null || end == null) {
      setPreciseNote(t(lang, 'precise_invalid'))
      return
    }
    let endHour = end
    if (endHour <= start && endHour + 24 <= windowEnd + 1e-6) endHour += 24
    const startHour = roundHour(start)
    endHour = roundHour(endHour)
    if (endHour <= startHour) {
      setPreciseNote(t(lang, 'end_after_start'))
      return
    }
    if (startHour < windowStart - 1e-6 || endHour > windowEnd + 1e-6) {
      setPreciseNote(t(lang, 'precise_outside'))
      return
    }
    setPreciseNote('')
    onChange({ startHour, endHour })
  }

  if (count === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-range-summary aria-live="polite">
          {summary}
        </p>
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
          const isStart = shown ? indexForHour(shown.startHour, windowStart) === index : false
          const isEnd = shown ? indexForHour(shown.endHour, windowStart) - 1 === index : false
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
              {selected && isStart && <span data-edge="start" className="slot-handle slot-handle-start" />}
              {selected && isEnd && <span data-edge="end" className="slot-handle slot-handle-end" />}
            </button>
          )
        })}
      </div>
      <p id={helpId} className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>
        {t(lang, 'drag_hint')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Adjust label={t(lang, 'earlier')} disabled={disabled || !shown || shown.startHour <= windowStart} onClick={() => shown && onChange(moveHourRange(shown, -1, windowStart, windowEnd))} />
        <Adjust label={t(lang, 'later')} disabled={disabled || !shown || shown.endHour >= windowEnd} onClick={() => shown && onChange(moveHourRange(shown, 1, windowStart, windowEnd))} />
        <Adjust label={t(lang, 'shorter')} disabled={disabled || !shown || durationHours(shown) <= SLOT_STEP} onClick={() => shown && onChange(resizeHourRange(shown, 'end', -1, windowStart, windowEnd))} />
        <Adjust label={t(lang, 'longer')} disabled={disabled || !shown || shown.endHour >= windowEnd} onClick={() => shown && onChange(resizeHourRange(shown, 'end', 1, windowStart, windowEnd))} />
        {allowClear && (
          <Adjust label={t(lang, 'clear_range')} disabled={disabled || !shown} onClick={() => onChange(null)} />
        )}
      </div>
      <details className="text-sm">
        <summary className={`min-h-11 cursor-pointer py-2 text-xs font-bold ${textMuted(isDarkMode)}`}>{t(lang, 'precise_time')}</summary>
        <div className="grid grid-cols-2 gap-2 pb-1">
          <label className={`space-y-1 text-[10px] font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
            {t(lang, 'from')}
            <input
              ref={startInput}
              value={startText}
              disabled={disabled}
              inputMode="numeric"
              placeholder="19:00"
              onChange={(event) => setStartText(event.target.value)}
              onBlur={commitPrecise}
              className={`w-full rounded-xl px-3 py-3 text-base font-bold ${inputClass(isDarkMode)}`}
            />
          </label>
          <label className={`space-y-1 text-[10px] font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
            {t(lang, 'until')}
            <input
              ref={endInput}
              value={endText}
              disabled={disabled}
              inputMode="numeric"
              placeholder="21:30"
              onChange={(event) => setEndText(event.target.value)}
              onBlur={commitPrecise}
              className={`w-full rounded-xl px-3 py-3 text-base font-bold ${inputClass(isDarkMode)}`}
            />
          </label>
        </div>
        {preciseNote && <p className="text-sm font-bold text-[#f19ba8]">{preciseNote}</p>}
      </details>
    </div>
  )
}

export function DurationGrid({
  value,
  onChange,
  max = 12,
  disabled = false,
  lang,
  isDarkMode,
  label,
  allowClear = false,
}: {
  value: number | null
  onChange: (hours: number | null) => void
  max?: number
  disabled?: boolean
  lang: Language
  isDarkMode: boolean
  label: string
  allowClear?: boolean
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const cap = Math.max(max, value ?? 0)
  const count = Math.round(cap / SLOT_STEP)
  const summary = value == null ? t(lang, 'range_length_empty') : `${value} ${t(lang, 'hours_unit')}`

  function choose(index: number) {
    onChange(durationFromCellCount(index + 1))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !gridRef.current) return
    const cell = (event.target as Element).closest('[data-slot]')
    if (!(cell instanceof HTMLElement) || !gridRef.current.contains(cell)) return
    event.preventDefault()
    dragging.current = true
    gridRef.current.setPointerCapture(event.pointerId)
    choose(Number(cell.dataset.slot))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current || !gridRef.current) return
    const index = indexAt(event.clientX, event.clientY, gridRef.current)
    if (index == null) return
    choose(index)
  }

  function finish() {
    dragging.current = false
    gridRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if ((event.key === 'Backspace' || event.key === 'Delete') && allowClear) {
      event.preventDefault()
      onChange(null)
      return
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !back) return
    event.preventDefault()
    const current = value == null ? 0 : Math.round(value / SLOT_STEP)
    const next = Math.min(count, Math.max(allowClear ? 0 : 1, current + (forward ? 1 : -1)))
    onChange(next === 0 ? null : durationFromCellCount(next))
  }

  return (
    <div className="space-y-3">
      <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-duration-summary aria-live="polite">
        {summary}
      </p>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        data-duration-grid=""
        className="slot-grid rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#7c7bb9]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: count }, (_, index) => {
          const hours = durationFromCellCount(index + 1)
          const selected = value != null && hours <= value + 1e-6
          return (
            <button
              key={hours}
              type="button"
              role="gridcell"
              data-slot={index}
              data-hours={hours}
              aria-selected={selected}
              disabled={disabled}
              className={`slot-cell ${selected ? 'bg-[#7c7bb9] text-white' : `glass-well ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}`}
            >
              {hours}
            </button>
          )
        })}
      </div>
      <p className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'drag_length_hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Adjust
          label={t(lang, 'shorter')}
          disabled={disabled || value == null || value <= SLOT_STEP}
          onClick={() => value != null && onChange(roundHour(value - SLOT_STEP))}
        />
        <Adjust
          label={t(lang, 'longer')}
          disabled={disabled || (value != null && value >= cap)}
          onClick={() => onChange(roundHour((value ?? 0) + SLOT_STEP))}
        />
        {allowClear && <Adjust label={t(lang, 'clear_range')} disabled={disabled || value == null} onClick={() => onChange(null)} />}
      </div>
    </div>
  )
}

function Adjust({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="glass-well min-h-11 rounded-full px-3 text-xs font-bold disabled:opacity-40">
      {label}
    </button>
  )
}
