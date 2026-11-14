import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { formatBlockLabel } from '../lib/blocks'
import { useCalendar } from '../lib/calendarContext'
import { formatLongDate, getDaysArray, parseISODate, toISODateString } from '../lib/dates'
import {
  busyAsUnavailable,
  busyWindow,
  clearGoogleToken,
  fetchBusy,
  GOOGLE_CALENDAR_ENABLED,
  GoogleCalendarError,
  type BusyRange,
} from '../lib/googleCalendar'
import { paintBlocks, spansFromDrag, type PaintCell, type PaintSpan } from '../lib/paint'
import { uncoveredDays } from '../lib/schedule'
import { formatClock, roundHour, SLOT_STEP, slotCount } from '../lib/timeRange'
import { withBlocks } from '../lib/blocks'
import { cardClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { AppConfig, BlockKind, Language, TimeBlock } from '../types'

function hourOf(date: Date): number {
  return roundHour(date.getHours() + date.getMinutes() / 60)
}

function markAt(blocks: TimeBlock[], iso: string, index: number, windowStart: number): BlockKind | null {
  const start = windowStart + index * SLOT_STEP
  const end = start + SLOT_STEP
  let kind: BlockKind | null = null
  for (const block of blocks) {
    if (toISODateString(block.start) !== iso) continue
    const blockStart = hourOf(block.start)
    const blockEnd = hourOf(block.end)
    if (blockEnd <= start + 1e-6 || blockStart >= end - 1e-6) continue
    if (block.kind === 'unavailable') return 'unavailable'
    kind = 'available'
  }
  return kind
}

function cellFromPoint(x: number, y: number): PaintCell | null {
  const node = document.elementFromPoint(x, y)
  const cell = node?.closest('[data-avail-cell]')
  if (cell instanceof HTMLElement && cell.dataset.day && cell.dataset.slot != null) {
    return { iso: cell.dataset.day, index: Number(cell.dataset.slot), header: false }
  }
  const header = node?.closest('[data-day-label]')
  if (header instanceof HTMLElement && header.dataset.day) {
    return { iso: header.dataset.day, index: 0, header: true }
  }
  return null
}

export function AvailabilityEditor({
  lang,
  isDarkMode,
  config,
  onDays,
  compulsoryDays,
  blocks,
  onChange,
  disabled = false,
}: {
  lang: Language
  isDarkMode: boolean
  config: AppConfig
  onDays: string[]
  compulsoryDays: string[]
  blocks: TimeBlock[]
  onChange: (blocks: TimeBlock[]) => void
  disabled?: boolean
}) {
  const [mode, setMode] = useState<BlockKind>('unavailable')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<PaintSpan[] | null>(null)
  const days = useMemo(
    () => getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate)),
    [config.startDate, config.endDate],
  )
  const dayIsos = useMemo(() => days.map((day) => toISODateString(day)), [days])
  const columns = slotCount(config.dayStartHour, config.dayEndHour)
  const positive = mode === 'available'
  const calendar = useCalendar()
  const [busy, setBusy] = useState<BusyRange[]>([])
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const missingDays = uncoveredDays(config, blocks)
  const missingLabel = missingDays.map((iso) => formatLongDate(parseISODate(iso), lang)).join(', ')
  const modeRef = useRef(mode)
  const blocksRef = useRef(blocks)
  const dragRef = useRef<PaintCell | null>(null)
  const movedRef = useRef(false)
  modeRef.current = mode
  blocksRef.current = blocks

  useEffect(() => {
    if (!GOOGLE_CALENDAR_ENABLED || !calendar.token) {
      setBusy([])
      setBusyState('idle')
      return
    }
    let alive = true
    setBusyState('loading')
    const range = busyWindow(config)
    void fetchBusy(calendar.token, range.start, range.end)
      .then((ranges) => {
        if (!alive) return
        setBusy(ranges)
        setBusyState('ready')
        calendar.setNote('')
      })
      .catch((error: unknown) => {
        if (!alive) return
        setBusy([])
        setBusyState('idle')
        if (error instanceof GoogleCalendarError && error.status === 401) clearGoogleToken()
        calendar.setNote(t(lang, 'calendar_scope'))
      })
    return () => {
      alive = false
    }
  }, [calendar.token, config.startDate, config.endDate, config.dayStartHour, config.dayEndHour, lang])

  function paint(spans: PaintSpan[]) {
    if (disabled || spans.length === 0) return
    onChange(paintBlocks(blocksRef.current, spans, config.dayStartHour, config.dayEndHour))
    setNote('')
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return
    const cell = cellFromPoint(event.clientX, event.clientY)
    if (!cell) return
    dragRef.current = cell
    movedRef.current = false
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer, or one the browser already released, can still paint through bubbling events.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragRef.current
    if (!origin) return
    const cell = cellFromPoint(event.clientX, event.clientY)
    if (!cell) return
    if (cell.iso !== origin.iso || cell.index !== origin.index || cell.header !== origin.header) movedRef.current = true
    setPreview(spansFromDrag(origin, cell, dayIsos, config.dayStartHour, config.dayEndHour, modeRef.current))
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragRef.current
    dragRef.current = null
    setPreview(null)
    if (!origin || disabled) return
    const cell = cellFromPoint(event.clientX, event.clientY) ?? origin
    if (!movedRef.current && origin.header) {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(origin.iso)) next.delete(origin.iso)
        else next.add(origin.iso)
        return next
      })
      setNote('')
      return
    }
    paint(spansFromDrag(origin, movedRef.current ? cell : origin, dayIsos, config.dayStartHour, config.dayEndHour, modeRef.current))
  }

  function paintSelected(kind: BlockKind) {
    if (disabled) return
    if (selected.size === 0) {
      setNote(t(lang, 'pick_days'))
      return
    }
    paint(
      [...selected].map((iso) => ({
        iso,
        startHour: config.dayStartHour,
        endHour: config.dayEndHour,
        kind,
      })),
    )
    setSelected(new Set())
  }

  function covered(iso: string, index: number, fallback: BlockKind | null): BlockKind | null {
    const start = config.dayStartHour + index * SLOT_STEP
    const end = start + SLOT_STEP
    const span = preview?.find((item) => item.iso === iso && item.startHour < end - 1e-6 && item.endHour > start + 1e-6)
    return span ? span.kind : fallback
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
      <div className={`order-2 lg:order-1 lg:col-span-4 ${cardClass(isDarkMode)} h-fit rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6`}>
        <h3 className={`inline-flex items-center gap-2 font-serif text-2xl font-semibold ${textPrimary(isDarkMode)}`}>
          {t(lang, 'your_submissions')}
          <InfoTip lang={lang} name="availability" text={t(lang, 'availability_hint')} />
        </h3>
        {missingDays.length > 0 && (
          <p className="mt-3 text-sm text-[#f19ba8]">{t(lang, 'mixed_incomplete', { days: missingLabel })}</p>
        )}
        {GOOGLE_CALENDAR_ENABLED && (
          <div className="mt-4 space-y-2">
            <InfoTip lang={lang} name="calendar" text={t(lang, 'calendar_hint')} />
            {calendar.note && <p className="text-xs text-[#f19ba8]">{calendar.note}</p>}
            {calendar.token ? (
              <button
                type="button"
                disabled={disabled || busyState !== 'ready' || busy.length === 0}
                onClick={() => onChange(withBlocks(blocks, busyAsUnavailable(config, busy)))}
                className={primaryButton('px-4 py-2 text-sm')}
              >
                {busyState === 'loading'
                  ? t(lang, 'loading')
                  : busyState === 'ready'
                    ? busy.length
                      ? `${t(lang, 'calendar_suggest')} · ${t(lang, 'calendar_busy', { n: busy.length })}`
                      : t(lang, 'calendar_none')
                    : t(lang, 'calendar_suggest')}
              </button>
            ) : (
              <button type="button" onClick={calendar.connect} className="glass-well rounded-full px-4 py-2 text-sm">
                {t(lang, 'calendar_connect')}
              </button>
            )}
          </div>
        )}
        <div className="mt-6 max-h-80 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {blocks.length === 0 ? (
            <p className={`text-sm italic ${textMuted(isDarkMode)}`}>{t(lang, 'no_times')}</p>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="glass-well flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
                <div>
                  <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>
                    {formatBlockLabel(block, lang, t(lang, 'whole_day'))}
                  </p>
                  <p className={`text-[10px] font-bold uppercase ${block.kind === 'available' ? 'text-[#93ba8c]' : 'text-[#f19ba8]'}`}>
                    {block.kind === 'available' ? t(lang, 'mode_available') : t(lang, 'mode_unavailable')}
                  </p>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(blocks.filter((item) => item.id !== block.id))}
                    className="flex h-11 w-11 items-center justify-center text-xl text-zinc-400 hover:text-[#f19ba8]"
                    aria-label={t(lang, 'remove')}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`order-1 min-w-0 lg:order-2 lg:col-span-8 ${cardClass(isDarkMode)} rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${disabled ? 'opacity-70' : ''}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <InfoTip lang={lang} name="legend" text={`${t(lang, 'availability_hint')}\n${t(lang, 'legend_marks')}`} />
        </div>
        <div className="glass-well mb-4 flex rounded-xl p-1" data-avail-mode={mode}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('unavailable')}
            className={`min-h-11 flex-1 rounded-lg py-3 text-xs font-bold uppercase ${!positive ? 'tone-fill-pink' : textMuted(isDarkMode)}`}
          >
            {t(lang, 'mode_unavailable')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('available')}
            className={`min-h-11 flex-1 rounded-lg py-3 text-xs font-bold uppercase ${positive ? 'tone-fill-sage' : textMuted(isDarkMode)}`}
          >
            {t(lang, 'mode_available')}
          </button>
        </div>

        <div className="heat-scroll custom-scrollbar" data-avail-scroll="">
          <div
            className="heat-sheet avail-sheet"
            data-avail-grid=""
            role="grid"
            aria-label={t(lang, 'your_submissions')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            style={{
              ['--heat-cell' as string]: '1.65rem',
              ['--heat-gap' as string]: '2px',
              gridTemplateColumns: `3.35rem repeat(${Math.max(days.length, 1)}, minmax(4.25rem, 1fr))`,
              gridTemplateRows: `auto repeat(${Math.max(columns, 1)}, var(--heat-cell))`,
            }}
          >
            <span className="heat-gutter" data-time-label="" style={{ gridColumn: 1, gridRow: 1 }} />
            {days.map((day, dayIndex) => {
              const iso = toISODateString(day)
              const picked = selected.has(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  data-day-label=""
                  data-day={iso}
                  aria-pressed={picked}
                  className={`heat-day ${picked ? 'heat-day-on' : textPrimary(isDarkMode)} ${onDays.includes(iso) ? 'ring-2 ring-[#f6cf7a]' : ''} ${compulsoryDays.includes(iso) ? 'outline outline-2 outline-[#f19ba8]' : ''}`}
                  style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                >
                  {formatLongDate(day, lang)}
                </button>
              )
            })}
            {Array.from({ length: columns }, (_, index) => (
              <span key={index} className="heat-time" data-time-label="" style={{ gridColumn: 1, gridRow: index + 2 }}>
                {index % 2 === 0 ? formatClock(roundHour(config.dayStartHour + index * SLOT_STEP)) : ''}
              </span>
            ))}
            {days.map((day, dayIndex) => {
              const iso = toISODateString(day)
              return (
                <div key={iso} className="heat-col" data-day={iso} style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${columns}` }}>
                  {Array.from({ length: columns }, (_, index) => {
                    const kind = covered(iso, index, markAt(blocks, iso, index, config.dayStartHour))
                    const tone = kind === 'unavailable' ? 'avail-cell-na' : kind === 'available' ? 'avail-cell-ok' : 'glass-well'
                    const start = config.dayStartHour + index * SLOT_STEP
                    const end = start + SLOT_STEP
                    const painted = preview?.some((item) => item.iso === iso && item.startHour < end - 1e-6 && item.endHour > start + 1e-6)
                    return (
                      <div
                        key={index}
                        data-avail-cell=""
                        data-day={iso}
                        data-slot={index}
                        data-mark={kind === 'unavailable' ? 'na' : kind === 'available' ? 'ok' : 'open'}
                        className={`heat-cell ${tone} ${painted ? 'avail-cell-preview' : ''}`}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>{t(lang, 'set_time_for', { n: selected.size })}</p>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-zinc-400">
                {t(lang, 'deselect_all')}
              </button>
            )}
          </div>
          {note && <p className="text-sm font-bold text-[#f19ba8]">{note}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={disabled} onClick={() => paintSelected('unavailable')} className="min-h-11 rounded-2xl py-3 text-sm font-bold tone-fill-pink">
              {t(lang, 'whole_day_na')}
            </button>
            <button type="button" disabled={disabled} onClick={() => paintSelected('available')} className="min-h-11 rounded-2xl py-3 text-sm font-bold tone-fill-sage">
              {t(lang, 'whole_day_avail')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
