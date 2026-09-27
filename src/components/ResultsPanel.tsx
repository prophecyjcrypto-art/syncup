import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { useCalendar } from '../lib/calendarContext'
import { buildIcs, formatSlotText } from '../lib/export'
import { clearGoogleToken, createCalendarEvents, GoogleCalendarError } from '../lib/googleCalendar'
import { formatLongDate, formatTime, getDaysArray, parseISODate, toISODateString } from '../lib/dates'
import { calculateBestSlots, compulsoryReport, sharedFreeByDay } from '../lib/schedule'
import { cardClass, textMuted, textPrimary } from '../lib/ui'
import { GuideNote, InfoTip } from './Guide'
import type { Campaign, Language, TimeSlot } from '../types'
import { MonthBoards } from './MonthBoards'

function slotKey(slot: TimeSlot): string {
  return slot.start.toISOString()
}

export function ResultsPanel({
  lang,
  isDarkMode,
  campaign,
  onBack,
  onSaveSlots,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  onBack: () => void
  onSaveSlots: (slots: string[]) => void
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
  const calendar = useCalendar()

  useEffect(() => {
    setRequiredIds(choreoKey ? choreoKey.split('|') : [])
  }, [choreoKey])
  useEffect(() => {
    setDancerIds(dancerKey ? dancerKey.split('|') : [])
  }, [dancerKey])

  const days = useMemo(
    () => getDaysArray(parseISODate(campaign.config.startDate), parseISODate(campaign.config.endDate)),
    [campaign.config.startDate, campaign.config.endDate],
  )
  const required = campaign.choreographers.filter((person) => requiredIds.includes(person.id))
  const dancers = campaign.dancers.filter((person) => dancerIds.includes(person.id))
  const everyone = [...campaign.choreographers, ...campaign.dancers]
  const slots = useMemo(
    () => calculateBestSlots(campaign.config, required, dancers),
    [campaign.config, required, dancers],
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
    const daySlots = slots.filter((slot) => {
      if (toISODateString(slot.start) !== iso || slot.attendanceScore < minAttendance) return false
      if (onDaysOnly && !campaign.onDays.includes(iso)) return false
      return true
    })
    if (daySlots.length === 0) return 0
    return daySlots.reduce((sum, slot) => sum + slot.attendanceScore, 0) / daySlots.length
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
              onClick={() => {
                const next = campaign.savedSlots.includes(key)
                  ? campaign.savedSlots.filter((item) => item !== key)
                  : [...campaign.savedSlots, key]
                onSaveSlots(next)
              }}
              className={`text-xl ${campaign.savedSlots.includes(key) ? 'text-[#f6cf7a]' : 'text-zinc-500'}`}
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
              className={`h-6 w-6 rounded-full border ${picked.has(key) ? 'bg-[#7c7bb9] border-[#7c7bb9]' : 'border-zinc-400'}`}
            />
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
          ← {t(lang, 'roster')}
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy(false)} className="glass-well rounded-full px-4 py-2 text-xs font-bold">{t(lang, 'copy_basic')}</button>
          <button type="button" onClick={() => void copy(true)} className="rounded-full btn-glow bg-[#7c7bb9] px-4 py-2 text-xs font-bold text-white">{t(lang, 'copy_full')}</button>
          <button type="button" onClick={exportCalendar} className="rounded-full border border-[#f6cf7a] px-4 py-2 text-xs font-bold text-[#f6cf7a]">{t(lang, 'export_calendar')}</button>
          <button type="button" onClick={() => void saveGoogle()} className="glass-well rounded-full px-4 py-2 text-xs font-medium">
            {calendar.token ? t(lang, 'calendar_save') : t(lang, 'calendar_connect')}
          </button>
        </div>
      </div>
      <GuideNote>{t(lang, 'guide_results')}</GuideNote>
      {notice && <p className="text-sm font-medium text-[#93ba8c]">{notice}</p>}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-5`}>
            <h3 className={`inline-flex items-center gap-2 font-medium ${textPrimary(isDarkMode)}`}>
              {t(lang, 'choreographer_filter')}
              <InfoTip lang={lang} text={t(lang, 'slots_rule')} />
            </h3>
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'choreographer_filter_hint')}</p>
            {campaign.choreographers.length === 0 && <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>}
            {campaign.choreographers.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={requiredIds.includes(person.id)}
                  onChange={() => toggleId(requiredIds, person.id, setRequiredIds)}
                />
                {person.name}
              </label>
            ))}
            {requiredIds.length === 0 && <p className="text-xs text-[#f6cf7a]">{t(lang, 'none_required')}</p>}
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'slots_rule')}</p>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={onDaysOnly} onChange={(event) => setOnDaysOnly(event.target.checked)} disabled={campaign.onDays.length === 0} />
              {t(lang, 'on_days_only')}
            </label>
          </section>
          <section className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-5`}>
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
                const tone = score >= 90 ? 'bg-[#7c7bb9] text-white' : score >= 70 ? 'bg-[#93ba8c] text-white' : score >= 50 ? 'bg-[#f6cf7a] text-zinc-900' : score > 0 ? (isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600') : (isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400')
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
                    className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg text-xs font-bold ${tone} ${selected ? 'ring-2 ring-white' : ''} ${campaign.compulsoryDays.includes(iso) ? 'outline outline-2 outline-[#f19ba8]' : ''}`}
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
          <details className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-5`}>
            <summary className="cursor-pointer font-bold">{t(lang, 'dancers_filter')} ({dancerIds.length}/{campaign.dancers.length})</summary>
            <button type="button" className="mt-3 text-xs font-bold text-[#7c7bb9]" onClick={() => setDancerIds(campaign.dancers.map((person) => person.id))}>
              {t(lang, 'select_all')}
            </button>
            <div className="mt-3 space-y-2">
              {campaign.dancers.map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={dancerIds.includes(person.id)} onChange={() => toggleId(dancerIds, person.id, setDancerIds)} />
                  {person.name}
                </label>
              ))}
            </div>
          </details>
          {report.length > 0 && (
            <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-5`}>
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
        <section className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-5`}>
          <h3 className={`font-serif text-2xl ${textPrimary(isDarkMode)}`}>
            {selectedDates.size > 0 ? t(lang, 'dates_selected', { n: selectedDates.size }) : t(lang, 'rehearsal_recommendations')}
          </h3>
          <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'found_slots', { n: dated.length })}</p>
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
            {dated.length === 0 && (
              <div className="py-16 text-center">
                <p className="font-medium text-zinc-400">{t(lang, 'no_results')}</p>
                <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'guide_empty_results')}</p>
              </div>
            )}
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
