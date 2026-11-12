import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { useCalendar } from '../lib/calendarContext'
import { buildIcs, formatSlotText } from '../lib/export'
import { clearGoogleToken, createCalendarEvents, GOOGLE_CALENDAR_ENABLED, GoogleCalendarError } from '../lib/googleCalendar'
import { formatLongDate, formatTime, getDaysArray, parseISODate, toISODateString } from '../lib/dates'
import { durationHours, fitDuration, roundHour, SLOT_STEP } from '../lib/timeRange'
import { availabilityHeatmap, calculateBestSlots, compulsoryReport, sharedFreeByDay } from '../lib/schedule'
import { cardClass, textMuted, textPrimary } from '../lib/ui'
import type { Campaign, Language, TimeSlot } from '../types'
import { MonthBoards } from './MonthBoards'
import { HeatBook, slotMatchesSession, type SessionRange } from './HeatBook'

function slotKey(slot: TimeSlot): string {
  return slot.start.toISOString()
}

function windowHours(slot: TimeSlot): { iso: string; startHour: number; endHour: number } {
  const iso = toISODateString(slot.start)
  const midnight = parseISODate(iso).getTime()
  return {
    iso,
    startHour: roundHour((slot.start.getTime() - midnight) / 3600000),
    endHour: roundHour((slot.end.getTime() - midnight) / 3600000),
  }
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
  const [dancerFilter, setDancerFilter] = useState<string[]>([])
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [onDaysOnly, setOnDaysOnly] = useState(false)
  const [minAttendance, setMinAttendance] = useState(70)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [draftHours, setDraftHours] = useState<number | null>(campaign.config.durationHours)
  const [sessions, setSessions] = useState<SessionRange[]>([])
  const [focusIso, setFocusIso] = useState<string | null>(null)
  const calendar = useCalendar()

  useEffect(() => {
    setRequiredIds(choreoKey ? choreoKey.split('|') : [])
  }, [choreoKey])
  useEffect(() => {
    setDancerFilter([])
  }, [dancerKey])
  useEffect(() => {
    setDraftHours(campaign.config.durationHours)
  }, [campaign.config.durationHours])

  const days = useMemo(
    () => getDaysArray(parseISODate(campaign.config.startDate), parseISODate(campaign.config.endDate)),
    [campaign.config.startDate, campaign.config.endDate],
  )
  const required = campaign.choreographers.filter((person) => requiredIds.includes(person.id))
  const dancers =
    dancerFilter.length === 0 ? campaign.dancers : campaign.dancers.filter((person) => dancerFilter.includes(person.id))
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
  const listed = dated.filter(
    (slot) => dancerFilter.length === 0 || dancerFilter.every((id) => slot.availableMembers.includes(id)),
  )
  const pinned = listed
    .filter((slot) => campaign.savedSlots.includes(slotKey(slot)))
    .sort((left, right) => left.start.getTime() - right.start.getTime())
  const others = listed.filter((slot) => !campaign.savedSlots.includes(slotKey(slot)))

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

  const maxHours = roundHour(Math.max(SLOT_STEP, campaign.config.dayEndHour - campaign.config.dayStartHour))

  function syncDuration(block: SessionRange) {
    if (!canSetDuration) return
    const hours = durationHours(block)
    setDraftHours(hours)
    if (hours !== campaign.config.durationHours) onSaveDuration?.(hours)
  }

  function commitSession(block: SessionRange, fromIso: string) {
    const taken = block.iso !== fromIso && sessions.some((item) => item.iso === block.iso)
    const placed = taken ? { ...block, iso: fromIso } : block
    setSessions((current) => [...current.filter((item) => item.iso !== fromIso && item.iso !== placed.iso), placed])
    setFocusIso(placed.iso)
    syncDuration(placed)
  }

  function focusSession(iso: string) {
    const block = sessions.find((item) => item.iso === iso)
    if (!block) return
    setFocusIso(iso)
    syncDuration(block)
  }

  function toggleDay(iso: string) {
    const existing = sessions.find((item) => item.iso === iso)
    if (existing) {
      const next = sessions.filter((item) => item.iso !== iso)
      setSessions(next)
      if (focusIso === iso) {
        setFocusIso(next[0]?.iso ?? null)
        if (next[0]) syncDuration(next[0])
      }
      return
    }
    const source = sessions.find((item) => item.iso === focusIso) ?? sessions[0]
    if (!source) return
    setSessions((current) => [...current.filter((item) => item.iso !== iso), { ...source, iso }])
  }

  function removeSession(iso: string) {
    const next = sessions.filter((item) => item.iso !== iso)
    setSessions(next)
    if (focusIso === iso) setFocusIso(next[0]?.iso ?? null)
  }

  function setLength(hours: number | null) {
    if (!canSetDuration) return
    if (hours == null || !Number.isFinite(hours) || hours <= 0) {
      setDraftHours(null)
      setSessions([])
      setFocusIso(null)
      return
    }
    const fitted = Math.min(Math.max(roundHour(hours), SLOT_STEP), maxHours)
    setDraftHours(fitted)
    if (focusIso) {
      setSessions((current) =>
        current.map((item) =>
          item.iso === focusIso ? { ...item, ...fitDuration(item, fitted, campaign.config.dayStartHour, campaign.config.dayEndHour) } : item,
        ),
      )
    }
    if (fitted !== campaign.config.durationHours) onSaveDuration?.(fitted)
  }

  function stepLength(delta: number) {
    if (!canSetDuration) return
    if (draftHours == null) {
      if (delta > 0) setLength(SLOT_STEP)
      return
    }
    setLength(roundHour(draftHours + delta * SLOT_STEP))
  }

  function toggleSavedMany(keys: string[]) {
    if (!canPin || keys.length === 0) return
    const allSaved = keys.every((key) => campaign.savedSlots.includes(key))
    const next = allSaved
      ? campaign.savedSlots.filter((key) => !keys.includes(key))
      : [...new Set([...campaign.savedSlots, ...keys])]
    onSaveSlots(next)
  }

  function toggleDancer(id: string) {
    setDancerFilter((current) => {
      if (current.length === 0) return [id]
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    })
  }

  function selectSlot(slot: TimeSlot) {
    const hours = windowHours(slot)
    const iso = focusIso ?? hours.iso
    commitSession({ iso, startHour: hours.startHour, endHour: hours.endHour }, focusIso ?? iso)
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
    const hours = windowHours(slot)
    const onCalendar = sessions.some((item) => slotMatchesSession(slot, item))
    const names = slot.availableMembers.map(nameOf)
    return (
      <article
        key={key}
        data-slot-card=""
        data-day={iso}
        data-start={hours.startHour}
        data-end={hours.endHour}
        data-selected-slot={onCalendar ? '' : undefined}
        onClick={() => selectSlot(slot)}
        className={`glass-well cursor-pointer rounded-2xl p-4 ${onCalendar ? 'ring-2 ring-[#f6cf7a]' : picked.has(key) ? 'ring-2 ring-[#7c7bb9]' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="min-w-0 text-left" onClick={() => setExpanded(expanded === key ? null : key)}>
            <p className={`font-bold ${textPrimary(isDarkMode)}`}>{formatLongDate(slot.start, lang)}</p>
            <p className="text-xs font-bold uppercase text-zinc-400">
              {formatTime(slot.start, lang)} – {formatTime(slot.end, lang)}
              {campaign.onDays.includes(iso) ? ` · ${t(lang, 'show_badge')}` : ''}
              {campaign.compulsoryDays.includes(iso) ? ` · ${t(lang, 'must_badge')}` : ''}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {t(lang, 'fully_available', { n: slot.score, total: dancers.length })}
              {names.length > 0 && names.length <= 4 ? ` · ${names.join(', ')}` : ''}
            </p>
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
      {notice && <p className="text-sm font-medium text-[#93ba8c]">{notice}</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
        <div className="order-2 min-w-0 space-y-3 md:order-1">
          <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
            <h3 className={`font-medium ${textPrimary(isDarkMode)}`}>{t(lang, 'choreographer_filter')}</h3>
            {campaign.choreographers.length === 0 && <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'list_empty')}</p>}
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
          {durationUnset ? null : <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'found_slots', { n: listed.length })}</p>}
          <div data-duration-hours="" className="mt-4 flex scroll-mt-24 items-center gap-3">
            <p className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'rehearsal_length')}</p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                data-duration-step="down"
                aria-label={t(lang, 'duration_decrease')}
                disabled={!canSetDuration || draftHours == null || draftHours <= SLOT_STEP + 1e-6}
                onClick={() => stepLength(-1)}
                className="glass-well flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold leading-none disabled:cursor-default disabled:opacity-40"
              >
                −
              </button>
              <p data-duration-value="" className={`min-w-[6.25rem] text-center text-sm font-bold tabular-nums ${textPrimary(isDarkMode)}`}>
                {draftHours == null ? '—' : `${draftHours} ${t(lang, 'hours_unit')}`}
              </p>
              <button
                type="button"
                data-duration-step="up"
                aria-label={t(lang, 'duration_increase')}
                disabled={!canSetDuration || (draftHours != null && draftHours >= maxHours - 1e-6)}
                onClick={() => stepLength(1)}
                className="glass-well flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold leading-none disabled:cursor-default disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'filter_dancers')}</p>
            {dancerFilter.length > 0 ? <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'filter_active')}</p> : null}
            <div className="chip-row chip-wrap py-1">
              <button
                type="button"
                data-dancer-id="all"
                aria-pressed={dancerFilter.length === 0}
                onClick={() => setDancerFilter([])}
                className={`min-h-11 cursor-pointer rounded-full px-3 text-xs font-bold ${dancerFilter.length === 0 ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}
              >
                {t(lang, 'filter_all')}
              </button>
              {campaign.dancers.map((person) => {
                const on = dancerFilter.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    data-dancer-id={person.id}
                    aria-pressed={on}
                    onClick={() => toggleDancer(person.id)}
                    className={`min-h-11 cursor-pointer rounded-full px-3 text-xs font-bold ${on ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}
                  >
                    {person.name}
                  </button>
                )
              })}
            </div>
          </div>
          <HeatBook
            lang={lang}
            isDarkMode={isDarkMode}
            dancers={dancers}
            heat={heat}
            slots={slots}
            savedSlots={campaign.savedSlots}
            sessions={sessions}
            focusIso={focusIso}
            durationHours={draftHours}
            editable={canSetDuration}
            canPin={canPin}
            windowStart={campaign.config.dayStartHour}
            windowEnd={campaign.config.dayEndHour}
            nameOf={nameOf}
            onCommit={commitSession}
            onFocus={focusSession}
            onToggleDay={toggleDay}
            onRemove={removeSession}
            onClearAll={() => {
              setSessions([])
              setFocusIso(null)
            }}
            onToggleSaved={toggleSavedMany}
          />
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto custom-scrollbar">
            <p className="text-xs font-bold uppercase tracking-widest text-[#f6cf7a]">{t(lang, 'choreographer_overlap')}</p>
            {required.length === 0 ? (
              <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'none_required')}</p>
            ) : openDays.length === 0 ? (
              <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_shared_time', { n: closedDays })}</p>
            ) : (
              openDays.map((day) => (
                <div key={day.iso}>
                  <p className="text-sm font-bold">{formatLongDate(parseISODate(day.iso), lang)}</p>
                  {day.windows.map((window) => (
                    <p key={`${day.iso}-${window.start.toISOString()}`} className={`text-xs ${textMuted(isDarkMode)}`}>
                      {formatTime(window.start, lang)} – {formatTime(window.end, lang)}
                    </p>
                  ))}
                </div>
              ))
            )}
            {closedDays > 0 && openDays.length > 0 && (
              <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'no_shared_time', { n: closedDays })}</p>
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
            ) : listed.length === 0 ? (
              <div className="py-16 text-center">
                <p className={`font-medium ${textMuted(isDarkMode)}`}>{t(lang, 'no_results')}</p>
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

function scoreTone(score: number, isDarkMode: boolean): string {
  if (score >= 90) return 'bg-[#7c7bb9] text-white'
  if (score >= 70) return 'bg-[#93ba8c] text-white'
  if (score >= 50) return 'bg-[#f6cf7a] text-zinc-900'
  if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
  return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
}
