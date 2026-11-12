import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { formatBlockLabel, makeBlock, withBlocks } from '../lib/blocks'
import { useCalendar } from '../lib/calendarContext'
import { formatLongDate, getDaysArray, parseISODate, toISODateString } from '../lib/dates'
import type { HourRange } from '../lib/timeRange'
import {
  busyAsUnavailable,
  busyWindow,
  clearGoogleToken,
  fetchBusy,
  GOOGLE_CALENDAR_ENABLED,
  GoogleCalendarError,
  type BusyRange,
} from '../lib/googleCalendar'
import { uncoveredDays } from '../lib/schedule'
import { cardClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import { MiniSteps } from './Guide'
import type { AppConfig, BlockKind, Language, TimeBlock } from '../types'
import { MonthBoards } from './MonthBoards'
import { TimeSlotGrid } from './TimeSlotGrid'

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
  const [range, setRange] = useState<HourRange | null>(null)
  const [note, setNote] = useState('')
  const days = useMemo(
    () => getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate)),
    [config.startDate, config.endDate],
  )
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
    if (disabled) return
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
    if (!wholeDay && !range) {
      setNote(t(lang, 'pick_time'))
      return
    }
    if (!wholeDay && range && range.endHour <= range.startHour) {
      setNote(t(lang, 'end_after_start'))
      return
    }
    const extra = [...selected].map((iso) =>
      makeBlock(
        iso,
        wholeDay ? config.dayStartHour : range!.startHour,
        wholeDay ? config.dayEndHour : range!.endHour,
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
        <h3 className={`font-serif text-2xl font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'your_submissions')}</h3>
        <p className={`mt-3 text-sm leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'availability_hint')}</p>
        {missingDays.length > 0 && (
          <p className="mt-3 text-sm text-[#f19ba8]">{t(lang, 'mixed_incomplete', { days: missingLabel })}</p>
        )}
        {GOOGLE_CALENDAR_ENABLED && (
          <div className="mt-4 space-y-2">
            <p className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'calendar_hint')}</p>
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

      <div className={`min-w-0 lg:col-span-7 ${cardClass(isDarkMode)} rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${disabled ? 'opacity-70' : ''}`}>
        <MiniSteps steps={[t(lang, 'avail_step_1'), t(lang, 'avail_step_2'), t(lang, 'avail_step_3')]} />
        <p className={`mb-4 text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'legend_marks')}</p>
        <div className="glass-well mb-4 flex rounded-xl p-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('unavailable')}
            className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase ${
              !positive ? 'bg-[#f19ba8] text-white' : textMuted(isDarkMode)
            }`}
          >
            {t(lang, 'mode_unavailable')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('available')}
            className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase ${
              positive ? 'bg-[#93ba8c] text-white' : textMuted(isDarkMode)
            }`}
          >
            {t(lang, 'mode_available')}
          </button>
        </div>

        <MonthBoards
          days={days}
          lang={lang}
          isDarkMode={isDarkMode}
          renderDay={(day) => {
            const iso = toISODateString(day)
            const chosen = selected.has(iso)
            const kinds = new Set(blocks.filter((block) => toISODateString(block.start) === iso).map((block) => block.kind))
            return (
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleDate(iso)}
                aria-label={formatLongDate(day, lang)}
                className={`cal-day relative flex w-full flex-col items-center justify-center rounded-lg text-xs font-bold leading-none ${
                  chosen
                    ? positive
                      ? 'bg-[#93ba8c] text-white'
                      : 'bg-[#f19ba8] text-white'
                    : `glass-well ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`
                } ${onDays.includes(iso) ? 'ring-2 ring-[#f6cf7a]' : ''} ${
                  compulsoryDays.includes(iso) ? 'outline outline-2 outline-[#f19ba8]' : ''
                }`}
              >
                {onDays.includes(iso) ? '★' : ''}
                {day.getDate()}
                <span className="mt-1 flex gap-1">
                  {kinds.has('unavailable') && <i className="h-1.5 w-1.5 rounded-full bg-[#f19ba8]" />}
                  {kinds.has('available') && <i className="h-1.5 w-1.5 rounded-full bg-[#93ba8c]" />}
                </span>
              </button>
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
          <TimeSlotGrid
            lang={lang}
            isDarkMode={isDarkMode}
            label={t(lang, 'session_grid')}
            windowStart={config.dayStartHour}
            windowEnd={config.dayEndHour}
            value={range}
            disabled={disabled}
            allowClear
            onChange={(next) => {
              setRange(next)
              setNote('')
            }}
          />
          {note && <p className="text-sm font-bold text-[#f19ba8]">{note}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection(mode, false)}
              className={`min-h-11 rounded-2xl py-3 text-sm font-bold text-white ${positive ? 'bg-[#93ba8c]' : 'bg-[#f19ba8]'}`}
            >
              {t(lang, 'apply')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection('unavailable', true)}
              className="min-h-11 rounded-2xl bg-[#f19ba8]/20 py-3 text-sm font-bold text-[#f19ba8]"
            >
              {t(lang, 'whole_day_na')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => addSelection('available', true)}
              className="min-h-11 rounded-2xl bg-[#93ba8c]/20 py-3 text-sm font-bold text-[#93ba8c]"
            >
              {t(lang, 'whole_day_avail')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
