import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { useCalendar } from '../lib/calendarContext'
import { buildIcs, formatSlotText } from '../lib/export'
import { clearGoogleToken, createCalendarEvents, GOOGLE_CALENDAR_ENABLED, GoogleCalendarError } from '../lib/googleCalendar'
import { formatLongDate, formatTime, getDaysArray, parseISODate, rangeOptions, setTime, toISODateString } from '../lib/dates'
import { durationHours, type HourRange } from '../lib/timeRange'
import { availabilityHeatmap, calculateBestSlots, compulsoryReport, sharedFreeByDay, type OverlapCell } from '../lib/schedule'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { GuideNote, InfoTip } from './Guide'
import type { Campaign, Language, TimeSlot } from '../types'
import { MonthBoards } from './MonthBoards'
import { TimeSlotGrid } from './TimeSlotGrid'

function slotKey(slot: TimeSlot): string {
  return slot.start.toISOString()
}

export function ResultsPanel({
  lang,
  isDarkMode,
  campaign,
  onBack,
  onSaveSlots,
  canPin = true,
  canSetDuration = true,
  onSaveDuration,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  onBack: () => void
  onSaveSlots: (slots: string[]) => void
  canPin?: boolean
  canSetDuration?: boolean
  onSaveDuration?: (hours: number) => void
}) {
  const choreoKey = campaign.choreographers.map((person) => person.id).join('|')
  const dancerKey = campaign.dancers.map((person) => person.id).join('|')
  const [requiredIds, setRequiredIds] = useState<string[]>(() => campaign.choreographers.map((person) => person.id))
  const [dancerIds, setDancerIds] = useState<string[]>(() => campaign.dancers.map((person) => person.id))
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [onDaysOnly, setOnDaysOnly] = useState(false)
  const [minAttendance, setMinAttendance] = useState(70)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [draftHours, setDraftHours] = useState<number | null>(campaign.config.durationHours)
  const [sessionRange, setSessionRange] = useState<HourRange | null>(null)
  const [focusStart, setFocusStart] = useState<string | null>(null)
  const calendar = useCalendar()

  useEffect(() => {
    setRequiredIds(choreoKey ? choreoKey.split('|') : [])
  }, [choreoKey])
  useEffect(() => {
    setDancerIds(dancerKey ? dancerKey.split('|') : [])
  }, [dancerKey])
  useEffect(() => {
    setDraftHours(campaign.config.durationHours)
  }, [campaign.config.durationHours])

  const days = useMemo(
    () => getDaysArray(parseISODate(campaign.config.startDate), parseISODate(campaign.config.endDate)),
    [campaign.config.startDate, campaign.config.endDate],
  )
  const required = campaign.choreographers.filter((person) => requiredIds.includes(person.id))
  const dancers = campaign.dancers.filter((person) => dancerIds.includes(person.id))
  const everyone = [...campaign.choreographers, ...campaign.dancers]
  const durationUnset = draftHours == null
  const slotConfig = { ...campaign.config, durationHours: draftHours }
  const slots = useMemo(
    () => calculateBestSlots(slotConfig, required, dancers),
    [slotConfig, required, dancers],
  )

  const dated = slots.filter((slot) => {
    const iso = toISODateString(slot.start)
    if (onDaysOnly && !campaign.onDays.includes(iso)) return false
    if (selectedDates.size > 0 && !selectedDates.has(iso)) return false
    return slot.attendanceScore >= minAttendance
  })
  const pinned = dated
    .filter((slot) => campaign.savedSlots.includes(slotKey(slot)))
    .sort((left, right) => left.start.getTime() - right.start.getTime())
  const others = dated.filter((slot) => !campaign.savedSlots.includes(slotKey(slot)))

  const overlapDates = (selectedDates.size > 0
    ? [...selectedDates]
    : onDaysOnly
      ? campaign.onDays
      : days.map((day) => toISODateString(day))
  ).sort()
  const overlap = sharedFreeByDay(campaign.config, required, overlapDates)
  const heat = availabilityHeatmap(campaign.config, dancers, overlapDates)
  const openDays = overlap.filter((day) => day.windows.length > 0)
  const closedDays = overlap.length - openDays.length
  const report = compulsoryReport(campaign.config, everyone, campaign.compulsoryDays)

  function nameOf(id: string): string {
    return everyone.find((person) => person.id === id)?.name ?? '?'
  }

  function toggleId(list: string[], id: string, setList: (ids: string[]) => void) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  function scoreFor(iso: string): number {
    if (durationUnset) {
      const day = heat.find((item) => item.iso === iso)
      if (!day || dancers.length === 0 || day.cells.length === 0) return 0
      const peak = day.cells.reduce((max, cell) => Math.max(max, cell.freeIds.length), 0)
      return (peak / dancers.length) * 100
    }
    const daySlots = slots.filter((slot) => {
      if (toISODateString(slot.start) !== iso || slot.attendanceScore < minAttendance) return false
      if (onDaysOnly && !campaign.onDays.includes(iso)) return false
      return true
    })
    if (daySlots.length === 0) return 0
    return daySlots.reduce((sum, slot) => sum + slot.attendanceScore, 0) / daySlots.length
  }

  function toggleSaved(key: string) {
    if (!canPin) return
    const next = campaign.savedSlots.includes(key)
      ? campaign.savedSlots.filter((item) => item !== key)
      : [...campaign.savedSlots, key]
    onSaveSlots(next)
  }

  function chooseLength(raw: string) {
    if (!canSetDuration) return
    if (raw === '') {
      setDraftHours(null)
      setSessionRange(null)
      return
    }
    const hours = Number(raw)
    setDraftHours(hours)
    setSessionRange((current) => {
      if (!current) return current
      const end = Math.round((current.startHour + hours) * 2) / 2
      if (end > campaign.config.dayEndHour) return null
      return { startHour: current.startHour, endHour: end }
    })
    if (hours !== campaign.config.durationHours) onSaveDuration?.(hours)
  }

  function applySession(range: HourRange | null) {
    setSessionRange(range)
    if (!canSetDuration) return
    if (!range) {
      if (campaign.config.durationHours == null) setDraftHours(null)
      return
    }
    const hours = durationHours(range)
    setDraftHours(hours)
    if (hours !== campaign.config.durationHours) onSaveDuration?.(hours)
    const iso = (selectedDates.size > 0 ? [...selectedDates].sort()[0] : heat[0]?.iso) ?? null
    if (!iso) return
    const target = setTime(parseISODate(iso), range.startHour).getTime()
    const cell = heat.find((day) => day.iso === iso)?.cells.find((item) => item.start.getTime() === target)
    if (cell) setFocusStart(cell.start.toISOString())
  }

  function targets(): TimeSlot[] {
    const chosen = dated.filter((slot) => picked.has(slotKey(slot)))
    const source = chosen.length > 0 ? chosen : pinned.length > 0 ? pinned : dated
    return [...source].sort((left, right) => left.start.getTime() - right.start.getTime())
  }

  async function copy(detailed: boolean) {
    const rows = targets()
    if (rows.length === 0) return
    const text = [`${campaign.name}`, ...rows.map((slot) => formatSlotText(slot, detailed, everyone, lang))].join('\n\n')
    await navigator.clipboard.writeText(text)
    setNotice(t(lang, 'link_copied'))
  }

  async function saveGoogle() {
    if (!GOOGLE_CALENDAR_ENABLED) return
    const rows = targets()
    if (!calendar.token) {
      calendar.connect()
      return
    }
    if (rows.length === 0) {
      setNotice(t(lang, 'calendar_empty'))
      return
    }
    try {
      const count = await createCalendarEvents(
        calendar.token,
        rows.map((slot) => ({
          summary: campaign.name,
          description: campaign.remarks,
          start: slot.start,
          end: slot.end,
        })),
      )
      setNotice(t(lang, 'calendar_saved', { n: count }))
    } catch (error) {
      if (error instanceof GoogleCalendarError && error.status === 401) clearGoogleToken()
      setNotice(t(lang, 'calendar_scope'))
    }
  }

  function exportCalendar() {
    const rows = targets()
    if (rows.length === 0) return
    const blob = new Blob([buildIcs(rows, campaign.name, campaign.remarks, everyone)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${campaign.name.replace(/\s+/g, '_')}.ics`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(t(lang, 'export_ready'))
  }

  function renderSlot(slot: TimeSlot) {
    const key = slotKey(slot)
    const iso = toISODateString(slot.start)
    return (
      <article key={key} className={`glass-well rounded-2xl p-4 ${picked.has(key) ? 'ring-2 ring-[#7c7bb9]' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="text-left" onClick={() => setExpanded(expanded === key ? null : key)}>
            <p className={`font-bold ${textPrimary(isDarkMode)}`}>{formatLongDate(slot.start, lang)}</p>
            <p className="text-xs font-bold uppercase text-zinc-400">
              {formatTime(slot.start, lang)} – {formatTime(slot.end, lang)}
              {campaign.onDays.includes(iso) ? ` · ${t(lang, 'show_badge')}` : ''}
              {campaign.compulsoryDays.includes(iso) ? ` · ${t(lang, 'must_badge')}` : ''}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{t(lang, 'fully_available', { n: slot.score, total: dancers.length })}</p>
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-[#93ba8c] px-2 py-1 text-xs font-bold text-white">{slot.attendanceScore}%</span>
            <button
              type="button"
              title={t(lang, 'pin_hint')}
              disabled={!canPin}
              onClick={() => toggleSaved(key)}
              className={`flex h-11 w-11 items-center justify-center text-xl disabled:cursor-default ${campaign.savedSlots.includes(key) ? 'text-[#f6cf7a]' : 'text-zinc-500'}`}
            >
              {campaign.savedSlots.includes(key) ? '★' : '☆'}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = new Set(picked)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                setPicked(next)
              }}
              className="flex h-11 w-11 items-center justify-center"
            >
              <span className={`h-6 w-6 rounded-full border ${picked.has(key) ? 'border-[#7c7bb9] bg-[#7c7bb9]' : 'border-zinc-400'}`} />
            </button>
          </div>
        </div>
        {expanded === key && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <NameGroup title={`${t(lang, 'mode_available')} (${slot.availableMembers.length})`} names={slot.availableMembers.map(nameOf)} tone="text-[#93ba8c]" />
            <div>
              <p className="text-[10px] font-bold uppercase text-[#f6cf7a]">{t(lang, 'partial_label')} ({slot.partialMembers.length})</p>
              {slot.partialMembers.map((member) => (
                <p key={member.id} className="text-sm">
                  {nameOf(member.id)}
                  {member.lateMins > 0 ? ` · late ${member.lateMins}m` : ''}
                  {member.earlyMins > 0 ? ` · early ${member.earlyMins}m` : ''}
                  {member.lateMins === 0 && member.earlyMins === 0 ? ` · -${member.missingMins}m` : ''}
                </p>
              ))}
            </div>
            <NameGroup title={`NA (${slot.unavailableMembers.length})`} names={slot.unavailableMembers.map((member) => nameOf(member.id))} tone="text-zinc-400" />
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className={`min-h-11 self-start text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
          ← {t(lang, 'roster')}
        </button>
        <div className="chip-row">
          <button type="button" onClick={() => void copy(false)} className="glass-well min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-bold">{t(lang, 'copy_basic')}</button>
          <button type="button" onClick={() => void copy(true)} className="min-h-11 shrink-0 whitespace-nowrap rounded-full btn-glow bg-[#7c7bb9] px-4 text-xs font-bold text-white">{t(lang, 'copy_full')}</button>
          <button type="button" onClick={exportCalendar} className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-[#f6cf7a] px-4 text-xs font-bold text-[#f6cf7a]">{t(lang, 'export_calendar')}</button>
          {GOOGLE_CALENDAR_ENABLED && (
            <button type="button" onClick={() => void saveGoogle()} className="glass-well min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-medium">
              {calendar.token ? t(lang, 'calendar_save') : t(lang, 'calendar_connect')}
            </button>
          )}
        </div>
      </div>
      <GuideNote>{t(lang, 'guide_results')}</GuideNote>
      {notice && <p className="text-sm font-medium text-[#93ba8c]">{notice}</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
        <div className="order-2 min-w-0 space-y-3 md:order-1">
          <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
            <h3 className={`inline-flex items-center gap-2 font-medium ${textPrimary(isDarkMode)}`}>
              {t(lang, 'choreographer_filter')}
              <InfoTip lang={lang} text={t(lang, durationUnset ? 'duration_not_set' : 'slots_rule')} />
            </h3>
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'choreographer_filter_hint')}</p>
            {campaign.choreographers.length === 0 && <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>}
            {campaign.choreographers.map((person) => (
              <label key={person.id} className="flex min-h-11 items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={requiredIds.includes(person.id)}
                  onChange={() => toggleId(requiredIds, person.id, setRequiredIds)}
                />
                {person.name}
              </label>
            ))}
            {requiredIds.length === 0 && <p className="text-xs text-[#f6cf7a]">{t(lang, 'none_required')}</p>}
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, durationUnset ? 'duration_not_set' : 'slots_rule')}</p>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={onDaysOnly} onChange={(event) => setOnDaysOnly(event.target.checked)} disabled={campaign.onDays.length === 0} />
              {t(lang, 'on_days_only')}
            </label>
          </section>
          <section className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`font-bold ${textPrimary(isDarkMode)}`}>{t(lang, 'availability_map')}</h3>
              {(selectedDates.size > 0 || minAttendance !== 70 || onDaysOnly) && (
                <button
                  type="button"
                  className="text-xs font-bold text-[#f19ba8]"
                  onClick={() => {
                    setSelectedDates(new Set())
                    setMinAttendance(70)
                    setOnDaysOnly(false)
                  }}
                >
                  {t(lang, 'reset_filters')}
                </button>
              )}
            </div>
            <p className={`mb-3 text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'tip_click_dates')}</p>
            <MonthBoards
              days={days}
              lang={lang}
              isDarkMode={isDarkMode}
              renderDay={(day) => {
                const iso = toISODateString(day)
                const score = scoreFor(iso)
                const selected = selectedDates.has(iso)
                return (
                  <button
                    type="button"
                    aria-label={formatLongDate(day, lang)}
                    onClick={() => {
                      const next = new Set(selectedDates)
                      if (next.has(iso)) next.delete(iso)
                      else next.add(iso)
                      setSelectedDates(next)
                    }}
                    className={`cal-day flex w-full items-center justify-center rounded-md text-xs font-bold leading-none ${scoreTone(score, isDarkMode)} ${selected ? 'ring-2 ring-white' : ''} ${campaign.compulsoryDays.includes(iso) ? 'outline outline-2 outline-[#f19ba8]' : ''}`}
                  >
                    {campaign.onDays.includes(iso) ? '★' : ''}
                    {day.getDate()}
                  </button>
                )
              }}
            />
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t(lang, 'attendance_threshold')}: {minAttendance}%
              <input type="range" min={0} max={100} step={10} value={minAttendance} onChange={(event) => setMinAttendance(Number(event.target.value))} className="mt-2 w-full accent-[#7c7bb9]" />
            </label>
          </section>
          <details className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-4 sm:p-5`}>
            <summary className="flex min-h-11 cursor-pointer items-center font-bold">{t(lang, 'dancers_filter')} ({dancerIds.length}/{campaign.dancers.length})</summary>
            <button type="button" className="mt-3 text-xs font-bold text-[#7c7bb9]" onClick={() => setDancerIds(campaign.dancers.map((person) => person.id))}>
              {t(lang, 'select_all')}
            </button>
            <div className="mt-3 space-y-2">
              {campaign.dancers.map((person) => (
                <label key={person.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={dancerIds.includes(person.id)} onChange={() => toggleId(dancerIds, person.id, setDancerIds)} />
                  {person.name}
                </label>
              ))}
            </div>
          </details>
          {report.length > 0 && (
            <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
              <h3 className={`font-bold ${textPrimary(isDarkMode)}`}>{t(lang, 'compulsory_report')}</h3>
              {report.map((day) => (
                <div key={day.iso}>
                  <p className="text-sm font-bold">{formatLongDate(parseISODate(day.iso), lang)}</p>
                  <p className="text-xs text-[#f19ba8]">{t(lang, 'status_absent')}: {day.absent.map(nameOf).join(', ') || '-'}</p>
                  <p className="text-xs text-[#f6cf7a]">{t(lang, 'status_partial')}: {day.partial.map(nameOf).join(', ') || '-'}</p>
                  <p className="text-xs text-[#93ba8c]">{t(lang, 'status_full')}: {day.full.length}</p>
                </div>
              ))}
            </section>
          )}
        </div>
        <section className={`${cardClass(isDarkMode)} order-1 min-w-0 rounded-[1.5rem] p-4 sm:p-5 md:order-2`}>
          <h3 className={`font-serif text-xl sm:text-2xl ${textPrimary(isDarkMode)}`}>
            {selectedDates.size > 0 ? t(lang, 'dates_selected', { n: selectedDates.size }) : t(lang, 'rehearsal_recommendations')}
          </h3>
          {durationUnset ? null : <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'found_slots', { n: dated.length })}</p>}
          <div className="mt-4">
            <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'session_grid')}</p>
            {canSetDuration ? (
              <TimeSlotGrid
                lang={lang}
                isDarkMode={isDarkMode}
                label={t(lang, 'session_grid')}
                windowStart={campaign.config.dayStartHour}
                windowEnd={campaign.config.dayEndHour}
                value={sessionRange}
                allowClear={campaign.config.durationHours == null}
                onChange={applySession}
              />
            ) : (
              <p className={`text-sm font-semibold ${textPrimary(isDarkMode)}`}>
                {draftHours == null ? t(lang, 'duration_not_set') : `${draftHours} ${t(lang, 'hours_unit')}`}
              </p>
            )}
            {canSetDuration && (
              <details className="mt-2">
                <summary className={`min-h-11 cursor-pointer py-2 text-xs font-bold ${textMuted(isDarkMode)}`}>{t(lang, 'rehearsal_length')}</summary>
                <select
                  value={draftHours ?? ''}
                  onChange={(event) => chooseLength(event.target.value)}
                  className={`w-full max-w-xs rounded-xl px-3 py-3 font-bold ${inputClass(isDarkMode)}`}
                >
                  {campaign.config.durationHours == null ? <option value="">{t(lang, 'choose_length_blank')}</option> : null}
                  {rangeOptions(0.5, 24).map((hour) => (
                    <option key={hour} value={hour}>{hour} {t(lang, 'hours')}</option>
                  ))}
                </select>
              </details>
            )}
          </div>
          <OverlapHeat
            lang={lang}
            isDarkMode={isDarkMode}
            dancers={dancers}
            heat={heat}
            slots={slots}
            savedSlots={campaign.savedSlots}
            durationHours={draftHours}
            sessionRange={sessionRange}
            focusStart={focusStart}
            canPin={canPin}
            nameOf={nameOf}
            onFocus={setFocusStart}
            onToggleSaved={toggleSaved}
          />
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto custom-scrollbar">
            <p className="text-xs font-bold uppercase tracking-widest text-[#f6cf7a]">{t(lang, 'choreographer_overlap')}</p>
            {required.length === 0 ? (
              <p className="text-sm text-zinc-400">{t(lang, 'none_required')}</p>
            ) : openDays.length === 0 ? (
              <p className="text-sm text-zinc-400">{t(lang, 'no_shared_time', { n: closedDays })}</p>
            ) : (
              openDays.map((day) => (
                <div key={day.iso}>
                  <p className="text-sm font-bold">{formatLongDate(parseISODate(day.iso), lang)}</p>
                  {day.windows.map((window) => (
                    <p key={`${day.iso}-${window.start.toISOString()}`} className="text-xs text-zinc-400">
                      {formatTime(window.start, lang)} – {formatTime(window.end, lang)}
                    </p>
                  ))}
                </div>
              ))
            )}
            {closedDays > 0 && openDays.length > 0 && (
              <p className="text-xs text-zinc-500">{t(lang, 'no_shared_time', { n: closedDays })}</p>
            )}
          </div>
          <div className="mt-6 space-y-4">
            {pinned.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#f6cf7a]">{t(lang, 'shortlist_title')} ({pinned.length})</h4>
                {pinned.map(renderSlot)}
              </div>
            )}
            {others.length > 0 && (
              <div className="space-y-2">
                {pinned.length > 0 && <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t(lang, 'all_results_title')} ({others.length})</h4>}
                {others.map(renderSlot)}
              </div>
            )}
            {durationUnset ? (
              <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'choose_length_first')}</p>
            ) : dated.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-medium text-zinc-400">{t(lang, 'no_results')}</p>
                <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'guide_empty_results')}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

function NameGroup({ title, names, tone }: { title: string; names: string[]; tone: string }) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase ${tone}`}>{title}</p>
      <p className="text-sm">{names.join(', ') || '-'}</p>
    </div>
  )
}

function axisLabel(date: Date): string {
  if (date.getMinutes() !== 0) return ''
  const hour = date.getHours()
  const suffix = hour >= 12 ? 'p' : 'a'
  const display = hour % 12 || 12
  return `${display}${suffix}`
}

function scoreTone(score: number, isDarkMode: boolean): string {
  if (score >= 90) return 'bg-[#7c7bb9] text-white'
  if (score >= 70) return 'bg-[#93ba8c] text-white'
  if (score >= 50) return 'bg-[#f6cf7a] text-zinc-900'
  if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
  return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
}

function OverlapHeat({
  lang,
  isDarkMode,
  dancers,
  heat,
  slots,
  savedSlots,
  durationHours,
  sessionRange,
  focusStart,
  canPin,
  nameOf,
  onFocus,
  onToggleSaved,
}: {
  lang: Language
  isDarkMode: boolean
  dancers: { id: string; name: string }[]
  heat: { iso: string; cells: OverlapCell[] }[]
  slots: TimeSlot[]
  savedSlots: string[]
  durationHours: number | null
  sessionRange: HourRange | null
  focusStart: string | null
  canPin: boolean
  nameOf: (id: string) => string
  onFocus: (start: string) => void
  onToggleSaved: (key: string) => void
}) {
  const focused = heat.flatMap((day) => day.cells).find((cell) => cell.start.toISOString() === focusStart) ?? null
  const matching = focused ? slots.find((slot) => slot.start.getTime() === focused.start.getTime()) ?? null : null
  const matchingKey = matching ? slotKey(matching) : null
  const saved = matchingKey != null && savedSlots.includes(matchingKey)
  const header = heat[0]?.cells ?? []

  return (
    <div className="mt-4 space-y-3">
      <div>
        <h4 className={`font-bold ${textPrimary(isDarkMode)}`}>{t(lang, 'heat_title')}</h4>
        <p className={`mt-1 text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'heat_hint')}</p>
      </div>
      {dancers.length === 0 ? (
        <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>
      ) : (
        <div className="max-h-72 max-w-full overflow-auto custom-scrollbar">
          <div className="w-max min-w-full space-y-1">
          <div className="flex items-end gap-2">
            <span className="w-16 shrink-0 sm:w-24" />
            <div className="flex gap-0.5">
              {header.map((cell) => (
                <span key={cell.start.toISOString()} className="w-9 text-center text-[9px] font-bold text-zinc-400">
                  {axisLabel(cell.start)}
                </span>
              ))}
            </div>
          </div>
          {heat.map((day) => (
            <div key={day.iso} className="flex items-center gap-2">
              <span className={`w-16 shrink-0 text-[11px] font-bold leading-tight sm:w-24 sm:text-xs ${textPrimary(isDarkMode)}`}>{formatLongDate(parseISODate(day.iso), lang)}</span>
              <div className="flex gap-0.5">
                {day.cells.map((cell) => {
                  const ratio = dancers.length === 0 ? 0 : (cell.freeIds.length / dancers.length) * 100
                  const key = cell.start.toISOString()
                  const hour = (cell.start.getTime() - parseISODate(day.iso).getTime()) / 3600000
                  const inSession = sessionRange != null && hour >= sessionRange.startHour - 1e-6 && hour < sessionRange.endHour - 1e-6
                  const pinned = slots.some(
                    (slot) => savedSlots.includes(slotKey(slot)) && cell.start.getTime() >= slot.start.getTime() && cell.start.getTime() < slot.end.getTime(),
                  )
                  return (
                    <button
                      key={key}
                      type="button"
                      title={`${formatTime(cell.start, lang)} · ${t(lang, 'heat_free', { n: cell.freeIds.length, total: dancers.length })}`}
                      aria-label={`${formatLongDate(cell.start, lang)} ${formatTime(cell.start, lang)} ${t(lang, 'heat_free', { n: cell.freeIds.length, total: dancers.length })}`}
                      onClick={() => onFocus(key)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${scoreTone(ratio, isDarkMode)} ${
                        focusStart === key ? 'ring-2 ring-[#7c7bb9]' : ''
                      } ${pinned ? 'outline outline-2 outline-[#f6cf7a]' : inSession ? 'outline outline-2 outline-white/80' : ''}`}
                    >
                      {cell.freeIds.length}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
      {focused ? (
        <div className="space-y-2">
          <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>
            {formatLongDate(focused.start, lang)} · {formatTime(focused.start, lang)} – {formatTime(focused.end, lang)}
          </p>
          <p className={`text-xs ${textMuted(isDarkMode)}`}>
            {t(lang, 'heat_free', { n: focused.freeIds.length, total: dancers.length })}
            {focused.freeIds.length > 0 ? ` · ${focused.freeIds.map(nameOf).join(', ')}` : ''}
          </p>
          {durationHours == null ? (
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'choose_length_first')}</p>
          ) : matching && canPin ? (
            <button
              type="button"
              onClick={() => onToggleSaved(matchingKey!)}
              className="rounded-full btn-glow bg-[#7c7bb9] px-4 py-2 text-xs font-bold text-white"
            >
              {saved ? t(lang, 'on_shortlist') : t(lang, 'use_this_time')}
            </button>
          ) : matching ? null : (
            <p className="text-xs text-[#f19ba8]">{t(lang, 'slot_blocked')}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
