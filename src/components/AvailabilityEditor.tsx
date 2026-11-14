import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { formatBlockLabel, makeBlock, withBlocks } from '../lib/blocks'
import { useCalendar } from '../lib/calendarContext'
import { formatHourOption, formatLongDate, getDaysArray, parseISODate, rangeOptions, toISODateString } from '../lib/dates'
import {
  busyAsUnavailable,
  busyWindow,
  clearGoogleToken,
  fetchBusy,
  GOOGLE_CALENDAR_ENABLED,
  GoogleCalendarError,
  type BusyRange,
} from '../lib/googleCalendar'
import { consumeDayClick } from '../lib/dayDrag'
import { uncoveredDays } from '../lib/schedule'
import { cardClass, inputClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import { InfoTip, MiniSteps } from './Guide'
import type { AppConfig, BlockKind, Language, TimeBlock } from '../types'
import { MonthBoards } from './MonthBoards'

function clockLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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
  confirmed = [],
  onOpenConfirmed,
}: {
  lang: Language
  isDarkMode: boolean
  config: AppConfig
  onDays: string[]
  compulsoryDays: string[]
  blocks: TimeBlock[]
  onChange: (blocks: TimeBlock[]) => void
  disabled?: boolean
  confirmed?: { id?: string; start: Date; end: Date; venue?: string; remarks?: string }[]
  onOpenConfirmed?: (session: { id?: string; start: Date; end: Date; venue?: string; remarks?: string }) => void
}) {
  const [mode, setMode] = useState<BlockKind>('unavailable')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [startHour, setStartHour] = useState(config.dayStartHour)
  const [endHour, setEndHour] = useState(config.dayEndHour)
  const [note, setNote] = useState('')
  const days = useMemo(
    () => getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate)),
    [config.startDate, config.endDate],
  )
  const confirmedByDay = useMemo(() => {
    const grouped = new Map<string, { id?: string; start: Date; end: Date; venue?: string; remarks?: string }[]>()
    for (const session of confirmed) {
      const iso = toISODateString(session.start)
      const list = grouped.get(iso) ?? []
      list.push(session)
      grouped.set(iso, list)
    }
    for (const list of grouped.values()) list.sort((left, right) => left.start.getTime() - right.start.getTime())
    return grouped
  }, [confirmed])
  const hours = rangeOptions(config.dayStartHour, config.dayEndHour)
  const positive = mode === 'available'
  const calendar = useCalendar()
  const [busy, setBusy] = useState<BusyRange[]>([])
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const missingDays = uncoveredDays(config, blocks)
  const missingLabel = missingDays.map((iso) => formatLongDate(parseISODate(iso), lang)).join(', ')

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

  function toggleDate(iso: string) {
    if (disabled || consumeDayClick()) return
    const next = new Set(selected)
    if (next.has(iso)) next.delete(iso)
    else next.add(iso)
    setSelected(next)
    setNote('')
  }

  function addSelection(kind: BlockKind, wholeDay: boolean) {
    if (disabled) return
    if (selected.size === 0) {
      setNote(t(lang, 'pick_days'))
      return
    }
    if (!wholeDay && endHour <= startHour) {
      setNote(t(lang, 'end_after_start'))
      return
    }
    const extra = [...selected].map((iso) =>
      makeBlock(
        iso,
        wholeDay ? config.dayStartHour : startHour,
        wholeDay ? config.dayEndHour : endHour,
        kind,
        wholeDay,
      ),
    )
    onChange(withBlocks(blocks, extra))
    setSelected(new Set())
    setNote('')
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
      <div className={`lg:col-span-5 ${cardClass(isDarkMode)} h-fit rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={`inline-flex items-center gap-2 font-serif text-2xl font-semibold ${textPrimary(isDarkMode)}`}>
            {t(lang, 'your_submissions')}
            <InfoTip lang={lang} name="availability" text={t(lang, 'availability_hint')} />
          </h3>
          {blocks.length > 0 && !disabled ? (
            <button type="button" data-clear-times="" onClick={() => onChange([])} className="tone-danger min-h-11 shrink-0 text-sm font-medium">
              {t(lang, 'clear_all')}
            </button>
          ) : null}
        </div>
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
              <div
                key={block.id}
                className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ${
                  'glass-well'
                }`}
              >
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
                    className="tone-danger flex h-11 w-11 items-center justify-center text-xl"
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

      <div className={`min-w-0 lg:col-span-7 ${cardClass(isDarkMode)} rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${disabled ? 'opacity-70' : ''}`}>
        <MiniSteps steps={[t(lang, 'avail_step_1'), t(lang, 'avail_step_2'), t(lang, 'avail_step_3')]} />
        <div className="mb-4">
          <InfoTip lang={lang} name="legend" text={t(lang, 'legend_marks')} />
        </div>
        <div className="glass-well mb-4 flex rounded-xl p-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('unavailable')}
            className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase ${
              !positive ? 'tone-fill-pink' : textMuted(isDarkMode)
            }`}
          >
            {t(lang, 'mode_unavailable')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('available')}
            className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase ${
              positive ? 'tone-fill-sage' : textMuted(isDarkMode)
            }`}
          >
            {t(lang, 'mode_available')}
          </button>
        </div>

        <MonthBoards
          days={days}
          lang={lang}
          isDarkMode={isDarkMode}
          selected={[...selected]}
          onSelectRange={disabled ? undefined : (next) => { setSelected(new Set(next)); setNote('') }}
          renderDay={(day) => {
            const iso = toISODateString(day)
            const chosen = selected.has(iso)
            const kinds = new Set(blocks.filter((block) => toISODateString(block.start) === iso).map((block) => block.kind))
            const booked = confirmedByDay.get(iso) ?? []
            const venueLabel = booked.map((session) => session.venue).filter(Boolean).join(' · ')
            return (
              <div key={iso} className="flex flex-col items-stretch gap-0.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDate(iso)}
                  data-cal-iso={iso}
                  aria-label={formatLongDate(day, lang)}
                  data-day-selected={chosen ? '' : undefined}
                  data-confirmed-day={booked.length > 0 ? iso : undefined}
                  data-venue={venueLabel || undefined}
                  className={`cal-day relative flex w-full flex-col items-center justify-center rounded-lg text-xs font-bold leading-none ${
                    chosen ? (positive ? 'tone-fill-sage' : 'tone-fill-pink') : `glass-well ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`
                  } ${onDays.includes(iso) ? 'ring-2 ring-[#f6cf7a]' : ''} ${
                    compulsoryDays.includes(iso) ? 'outline outline-2 outline-[#f19ba8]' : ''
                  }`}
                >
                  {onDays.includes(iso) ? '★' : ''}
                  {day.getDate()}
                  <span className="mt-0.5 flex gap-1">
                    {booked.length > 0 ? <i className="h-1.5 w-1.5 rounded-full bg-[color:var(--logo-gold)]" /> : null}
                    {kinds.has('unavailable') && <i className="h-1.5 w-1.5 rounded-full bg-[#f19ba8]" />}
                    {kinds.has('available') && <i className="h-1.5 w-1.5 rounded-full bg-[#93ba8c]" />}
                  </span>
                </button>
                {booked.map((session) => (
                  <button
                    key={session.id ?? session.start.toISOString()}
                    type="button"
                    data-open-session={session.id ?? session.start.toISOString()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onOpenConfirmed?.(session)}
                    className={`max-w-full truncate rounded-md px-0.5 text-[8px] font-semibold leading-tight ${isDarkMode ? 'text-[color:var(--logo-gold)]' : 'text-[color:var(--logo-gold-ink)]'}`}
                  >
                    {clockLabel(session.start)}
                    {session.venue ? ` ${session.venue}` : ''}
                  </button>
                ))}
              </div>
            )
          }}
        />

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>
              {t(lang, 'set_time_for', { n: selected.size })}
            </p>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-zinc-400">
                {t(lang, 'deselect_all')}
              </button>
            )}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <label className="space-y-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t(lang, 'from')}
              <select
                value={startHour}
                disabled={disabled}
                onChange={(event) => setStartHour(Number(event.target.value))}
                className={`w-full min-w-0 max-w-full box-border rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
              >
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {formatHourOption(hour)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t(lang, 'until')}
              <select
                value={endHour}
                disabled={disabled}
                onChange={(event) => setEndHour(Number(event.target.value))}
                className={`w-full min-w-0 max-w-full box-border rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
              >
                {hours.map((hour) => (
                  <option key={`end-${hour}`} value={hour}>
                    {formatHourOption(hour)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {note && <p className="text-sm font-bold text-[#f19ba8]">{note}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection(mode, false)}
              className={`min-h-11 rounded-2xl py-3 text-sm font-bold ${positive ? 'tone-fill-sage' : 'tone-fill-pink'}`}
            >
              {t(lang, 'apply')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection('unavailable', true)}
              className="tone-soft-pink min-h-11 rounded-2xl py-3 text-sm font-bold"
            >
              {t(lang, 'whole_day_na')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection('available', true)}
              className="tone-soft-sage min-h-11 rounded-2xl py-3 text-sm font-bold"
            >
              {t(lang, 'whole_day_avail')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
