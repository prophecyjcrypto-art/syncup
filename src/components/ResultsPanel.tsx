import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'
import { useCalendar } from '../lib/calendarContext'
import { buildIcs, formatSlotText } from '../lib/export'
import { clearGoogleToken, createCalendarEvents, GOOGLE_CALENDAR_ENABLED, GoogleCalendarError } from '../lib/googleCalendar'
import { formatHourOption, formatLongDate, formatTime, getDaysArray, parseISODate, rangeOptions, setTime, toISODateString } from '../lib/dates'
import { durationHours, fitDuration, roundHour, SLOT_STEP } from '../lib/timeRange'
import { availabilityHeatmap, calculateBestSlots, classifySessionWindow, compulsoryReport, sharedFreeByDay, shortlistSessionHours, startsAtOrAfter, type MarkFilter } from '../lib/schedule'
import { consumeDayClick } from '../lib/dayDrag'
import { commitSessions, toggleSessionDay, type SessionRange } from '../lib/sessions'
import { organizersOf } from '../lib/roles'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { Campaign, Language, SessionNote, TimeSlot } from '../types'
import { MonthBoards } from './MonthBoards'
import { AnalysisPanel } from './AnalysisPanel'
import { ChangeRequestList } from './ChangeRequests'
import { HeatBook, slotMatchesSession } from './HeatBook'
import { MarkFilterControl } from './MarkFilter'

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
  onPublish,
  onResolveRequest,
  embedded = false,
  initialPick = 'manual',
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  onBack: () => void
  onSaveSlots: (slots: string[]) => void
  canPin?: boolean
  canSetDuration?: boolean
  onSaveDuration?: (hours: number) => void
  onPublish?: (slots: string[], notes: Record<string, SessionNote>) => void
  onResolveRequest?: (id: string, decision: 'accepted' | 'declined') => void
  embedded?: boolean
  initialPick?: 'manual' | 'suggest'
}) {
  const organizers = organizersOf(campaign)
  const choreoKey = organizers.map((person) => person.id).join('|')
  const dancerKey = campaign.dancers.map((person) => person.id).join('|')
  const [requiredIds, setRequiredIds] = useState<string[]>(() => organizersOf(campaign).map((person) => person.id))
  const [dancerFilter, setDancerFilter] = useState<string[]>([])
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [onDaysOnly, setOnDaysOnly] = useState(false)
  const [minAttendance, setMinAttendance] = useState(70)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [draftHours, setDraftHours] = useState<number | null>(campaign.config.durationHours)
  const [sessions, setSessions] = useState<SessionRange[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [markFilter, setMarkFilter] = useState<MarkFilter>('both')
  const [resultsView, setResultsView] = useState<'schedule' | 'analysis'>('schedule')
  const [pickMode, setPickMode] = useState<'manual' | 'suggest'>(initialPick)
  const [earliestStart, setEarliestStart] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<string, SessionNote>>(() => ({ ...(campaign.config.sessionNotes ?? {}) }))
  const [shortlist, setShortlist] = useState<string[]>([])
  const [finalKeys, setFinalKeys] = useState<string[]>(campaign.savedSlots)
  const [cardChecks, setCardChecks] = useState<Set<string>>(new Set())
  const [noteEditor, setNoteEditor] = useState<string[] | null>(null)
  const [editorVenue, setEditorVenue] = useState('')
  const [editorRemarks, setEditorRemarks] = useState('')
  const calendar = useCalendar()
  const notesKey = JSON.stringify(campaign.config.sessionNotes ?? {})
  const savedKey = campaign.savedSlots.join('|')

  useEffect(() => {
    setRequiredIds(choreoKey ? choreoKey.split('|') : [])
  }, [choreoKey])
  useEffect(() => {
    setDancerFilter([])
  }, [dancerKey])
  useEffect(() => {
    setDraftHours(campaign.config.durationHours)
  }, [campaign.config.durationHours])
  useEffect(() => {
    setNotes({ ...(campaign.config.sessionNotes ?? {}) })
  }, [notesKey])
  useEffect(() => {
    setFinalKeys(campaign.savedSlots)
  }, [savedKey])

  const days = useMemo(
    () => getDaysArray(parseISODate(campaign.config.startDate), parseISODate(campaign.config.endDate)),
    [campaign.config.startDate, campaign.config.endDate],
  )
  const required = organizers.filter((person) => requiredIds.includes(person.id))
  const activeGroup = campaign.groups.find((group) => group.id === groupId) ?? null
  const population = activeGroup ? campaign.dancers.filter((person) => activeGroup.memberIds.includes(person.id)) : campaign.dancers
  const dancers = dancerFilter.length === 0 ? population : population.filter((person) => dancerFilter.includes(person.id))
  const everyone = [...campaign.choreographers, ...campaign.dancers]
  const durationUnset = draftHours == null
  const slotConfig = { ...campaign.config, durationHours: draftHours }
  const slots = useMemo(
    () => calculateBestSlots(slotConfig, required, dancers),
    [slotConfig, required, dancers],
  )
  const windowSlots = useMemo(() => {
    return sessions.flatMap((session) => {
      if (slots.some((slot) => slotMatchesSession(slot, session))) return []
      const start = setTime(parseISODate(session.iso), session.startHour)
      const end = setTime(parseISODate(session.iso), session.endHour)
      if (end.getTime() <= start.getTime()) return []
      return [classifySessionWindow(dancers, start, end, slotConfig.attendanceTolerance)]
    })
  }, [sessions, slots, dancers, slotConfig.attendanceTolerance])
  const shownSlots = useMemo(() => [...slots, ...windowSlots], [slots, windowSlots])

  const listed = shownSlots.filter((slot) => {
    const iso = toISODateString(slot.start)
    if (selectedDates.size > 0 && !selectedDates.has(iso)) return false
    if (slot.attendanceScore < minAttendance) return false
    if (dancerFilter.length > 0 && !dancerFilter.every((id) => slot.availableMembers.includes(id))) return false
    return startsAtOrAfter(slot.start, earliestStart)
  })
  const pinned = shownSlots
    .filter((slot) => shortlist.includes(slotKey(slot)))
    .sort((left, right) => left.start.getTime() - right.start.getTime())
  const others = listed.filter((slot) => !shortlist.includes(slotKey(slot)))
  const cardKeys = useMemo(() => {
    const painted = sessions.map((session) => setTime(parseISODate(session.iso), session.startHour).toISOString())
    return [...new Set([...finalKeys, ...painted])]
  }, [finalKeys, sessions])

  const heatDates = (onDaysOnly ? campaign.onDays : days.map((day) => toISODateString(day))).sort()
  const listedHours = shortlistSessionHours(campaign.config.durationHours, cardKeys)
  const overlap = sharedFreeByDay(campaign.config, required, heatDates)
  const heat = availabilityHeatmap(campaign.config, dancers, heatDates, markFilter)
  useEffect(() => {
    if (groupId && !campaign.groups.some((group) => group.id === groupId)) setGroupId(null)
  }, [campaign.groups, groupId])

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

  function toggleShortlist(key: string) {
    if (!canPin || cardKeys.includes(key)) return
    setShortlist((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  function confirmShortlist() {
    if (!canPin || shortlist.length === 0) return
    setFinalKeys((current) => [...new Set([...current, ...shortlist])])
    setShortlist([])
  }

  function removeFinal(key: string) {
    setFinalKeys((current) => current.filter((item) => item !== key))
    setShortlist((current) => current.filter((item) => item !== key))
    setSessions((current) => current.filter((session) => setTime(parseISODate(session.iso), session.startHour).toISOString() !== key))
    setCardChecks((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  const maxHours = roundHour(Math.max(SLOT_STEP, campaign.config.dayEndHour - campaign.config.dayStartHour))

  function syncDuration(block: SessionRange) {
    if (!canSetDuration) return
    const hours = durationHours(block)
    setDraftHours(hours)
    if (hours !== campaign.config.durationHours) onSaveDuration?.(hours)
  }

  function commitSession(block: SessionRange, sourceId: string | null) {
    const result = commitSessions(sessions, block, sourceId)
    setSessions(result.sessions)
    setFocusId(result.focusId)
    const placed = result.sessions.find((item) => item.id === result.focusId)
    if (placed) syncDuration(placed)
  }

  function focusSession(id: string) {
    const block = sessions.find((item) => item.id === id)
    if (!block) return
    setFocusId(id)
    syncDuration(block)
  }

  function paintSessionDays(isos: string[]) {
    const source = sessions.find((item) => item.id === focusId) ?? sessions[0]
    if (!source) return
    const wanted = new Set(isos)
    setSessions((current) => {
      const base = current.find((item) => item.id === source.id) ?? source
      const others = current.filter((item) => item.startHour !== base.startHour || item.endHour !== base.endHour)
      const kept = current.filter((item) => item.startHour === base.startHour && item.endHour === base.endHour && wanted.has(item.iso))
      const have = new Set(kept.map((item) => item.iso))
      const added = [...wanted].filter((iso) => !have.has(iso)).map((iso) => ({ ...base, id: crypto.randomUUID(), iso }))
      return [...others, ...kept, ...added]
    })
  }

  function toggleDay(iso: string) {
    if (consumeDayClick()) return
    const source = sessions.find((item) => item.id === focusId) ?? sessions[0]
    if (!source) return
    const exact = sessions.find((item) => item.iso === iso && item.startHour === source.startHour && item.endHour === source.endHour)
    if (exact) {
      setSessions((current) => current.filter((item) => item.id !== exact.id && !(item.iso === iso && item.startHour === source.startHour && item.endHour === source.endHour)))
      if (focusId === exact.id) {
        const rest = sessions.filter((item) => item.id !== exact.id)
        setFocusId(rest[0]?.id ?? null)
        if (rest[0]) syncDuration(rest[0])
      }
      return
    }
    const addedId = crypto.randomUUID()
    setSessions((current) => {
      const base = current.find((item) => item.id === source.id) ?? source
      return toggleSessionDay(current, iso, base, addedId).sessions
    })
    setFocusId(addedId)
    syncDuration({ ...source, id: addedId, iso })
  }

  function removeSession(id: string) {
    const next = sessions.filter((item) => item.id !== id)
    setSessions(next)
    if (focusId === id) setFocusId(next[0]?.id ?? null)
  }

  function setLength(hours: number | null) {
    if (!canSetDuration) return
    if (hours == null || !Number.isFinite(hours) || hours <= 0) {
      setDraftHours(null)
      setSessions([])
      setFocusId(null)
      return
    }
    const fitted = Math.min(Math.max(roundHour(hours), SLOT_STEP), maxHours)
    setDraftHours(fitted)
    if (focusId) {
      setSessions((current) =>
        current.map((item) =>
          item.id === focusId ? { ...item, ...fitDuration(item, fitted, campaign.config.dayStartHour, campaign.config.dayEndHour) } : item,
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

  function publish(keys: string[]) {
    if (!canPin || keys.length === 0) return
    const next: Record<string, SessionNote> = {}
    for (const key of keys) {
      const note = notes[key] ?? { venue: '', remarks: '' }
      next[key] = { venue: note.venue.trim(), remarks: note.remarks.trim() }
    }
    if (onPublish) onPublish(keys, next)
    else onSaveSlots(keys)
    setNotice(t(lang, 'published_done'))
  }

  function toggleDancer(id: string) {
    setDancerFilter((current) => {
      if (current.length === 0) return [id]
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    })
  }

  function selectSlot(slot: TimeSlot) {
    const hours = windowHours(slot)
    const current = sessions.find((item) => item.id === focusId) ?? sessions[0]
    if (!current) {
      commitSession({ id: crypto.randomUUID(), ...hours }, null)
      return
    }
    commitSession({ ...current, iso: hours.iso, startHour: hours.startHour, endHour: hours.endHour }, current.id)
  }

  function targets(): TimeSlot[] {
    const chosen = listed.filter((slot) => picked.has(slotKey(slot)))
    const source = chosen.length > 0 ? chosen : pinned.length > 0 ? pinned : listed
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
            {cardKeys.includes(key) ? (
              <span data-final-mark="" className="px-2 text-xs font-bold text-[#f6cf7a]">{t(lang, 'final_mark')}</span>
            ) : (
              <button
                type="button"
                data-pin-slot=""
                title={t(lang, 'pin_hint')}
                disabled={!canPin}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleShortlist(key)
                }}
                className={`flex h-11 w-11 items-center justify-center text-xl disabled:cursor-default ${shortlist.includes(key) ? 'text-[#f6cf7a]' : 'text-zinc-500'}`}
              >
                {shortlist.includes(key) ? '★' : '☆'}
              </button>
            )}
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

  function describeKey(key: string): string {
    const start = new Date(key)
    if (Number.isNaN(start.getTime())) return key
    const painted = sessions.find((session) => setTime(parseISODate(session.iso), session.startHour).toISOString() === key)
    const hours = painted ? durationHours(painted) : (draftHours ?? campaign.config.durationHours ?? 0)
    const end = new Date(start.getTime() + hours * 3600000)
    return `${formatLongDate(start, lang)} · ${formatTime(start, lang)}${hours > 0 ? ` – ${formatTime(end, lang)}` : ''}`
  }

  function openNoteEditor(keys: string[]) {
    if (keys.length === 0) return
    const first = notes[keys[0]] ?? { venue: '', remarks: '' }
    const sameVenue = keys.every((key) => (notes[key]?.venue ?? '') === first.venue)
    const sameRemarks = keys.every((key) => (notes[key]?.remarks ?? '') === first.remarks)
    setEditorVenue(sameVenue ? first.venue : '')
    setEditorRemarks(sameRemarks ? first.remarks : '')
    setNoteEditor(keys)
  }

  function saveNoteEditor() {
    if (!noteEditor) return
    const venue = editorVenue.trim()
    const remarks = editorRemarks.trim()
    setNotes((current) => {
      const next = { ...current }
      for (const key of noteEditor) next[key] = { venue, remarks }
      return next
    })
    setNoteEditor(null)
  }

  function toggleCardCheck(key: string) {
    setCardChecks((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function peopleFilters() {
    return (
      <div className="space-y-2" data-people-filters="">
        {campaign.groups.length > 0 ? (
          <div className="chip-row py-1">
            <button
              type="button"
              data-group-id="all"
              aria-pressed={groupId === null}
              onClick={() => setGroupId(null)}
              className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${groupId === null ? 'chip-on' : 'glass-well'}`}
            >
              {t(lang, 'filter_all')}
            </button>
            {campaign.groups.map((group) => {
              const on = groupId === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  data-group-id={group.id}
                  aria-pressed={on}
                  onClick={() => {
                    setGroupId(group.id)
                    setDancerFilter([])
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${on ? 'chip-on' : 'glass-well'}`}
                >
                  {group.name}
                </button>
              )
            })}
          </div>
        ) : null}
        <p className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
          {t(lang, 'filter_dancers')}
          <InfoTip lang={lang} name="dancers" text={t(lang, dancerFilter.length === 0 ? 'filter_hint' : 'filter_active')} />
        </p>
        <div className="chip-row py-1">
          <button
            type="button"
            data-dancer-id="all"
            aria-pressed={dancerFilter.length === 0}
            onClick={() => setDancerFilter([])}
            className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${dancerFilter.length === 0 ? 'chip-on' : 'glass-well'}`}
          >
            {t(lang, 'filter_all')}
          </button>
          {population.map((person) => {
            const on = dancerFilter.includes(person.id)
            return (
              <button
                key={person.id}
                type="button"
                data-dancer-id={person.id}
                aria-pressed={on}
                onClick={() => toggleDancer(person.id)}
                className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${on ? 'chip-on' : 'glass-well'}`}
              >
                {person.name}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function selectedSlots() {
    return (
      <section className="space-y-3" data-selected-slots="">
        <div className="chip-row">
          {listedHours != null ? (
            <p data-shortlist-hours="" className={`shrink-0 self-center text-xs font-bold tabular-nums ${textMuted(isDarkMode)}`}>
              {t(lang, 'stats_session')} {listedHours}
            </p>
          ) : null}
          <button type="button" onClick={() => void copy(false)} className="glass-well min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-bold">{t(lang, 'copy_basic')}</button>
          <button type="button" onClick={() => void copy(true)} className="tone-fill-gold min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-bold">{t(lang, 'copy_full')}</button>
          <button type="button" onClick={exportCalendar} className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-[#f6cf7a] px-4 text-xs font-bold text-[#f6cf7a]">{t(lang, 'export_calendar')}</button>
          {GOOGLE_CALENDAR_ENABLED && (
            <button type="button" onClick={() => void saveGoogle()} className="glass-well min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-medium">
              {calendar.token ? t(lang, 'calendar_save') : t(lang, 'calendar_connect')}
            </button>
          )}
          {canPin ? (
            <button type="button" data-publish="" disabled={cardKeys.length === 0} onClick={() => publish(cardKeys)} className="btn-glow btn-primary min-h-11 shrink-0 rounded-full px-4 text-xs font-bold disabled:opacity-40">
              {t(lang, 'publish')}
            </button>
          ) : null}
        </div>
        {canPin && cardKeys.length > 0 ? (
          <div className="space-y-2">
            {cardChecks.size > 0 ? (
              <button type="button" data-batch-edit="" onClick={() => openNoteEditor([...cardChecks])} className="glass-well min-h-11 rounded-full px-4 text-xs font-bold">
                {t(lang, 'batch_edit')}
              </button>
            ) : null}
            {cardKeys.map((key) => {
              const note = notes[key] ?? { venue: '', remarks: '' }
              const checked = cardChecks.has(key)
              return (
                <article key={key} data-selected-card="" data-slot-key={key} className="glass-well rounded-2xl p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      data-card-check=""
                      checked={checked}
                      aria-label={describeKey(key)}
                      onChange={() => toggleCardCheck(key)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>{describeKey(key)}</p>
                      {note.venue ? <p data-card-venue="" className={`mt-1 text-sm ${textPrimary(isDarkMode)}`}>{note.venue}</p> : null}
                      {note.remarks ? <p data-card-remarks="" className={`mt-1 whitespace-pre-wrap text-xs ${textMuted(isDarkMode)}`}>{note.remarks}</p> : null}
                    </div>
                    <button type="button" data-edit-slot="" aria-label={t(lang, 'edit_details')} onClick={() => openNoteEditor([key])} className="glass-well flex h-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-bold">
                      {t(lang, 'edit_details')}
                    </button>
                    <button type="button" data-remove-final="" aria-label={t(lang, 'remove')} onClick={() => removeFinal(key)} className="min-h-11 shrink-0 px-2 text-sm font-bold text-[#f19ba8]">
                      {t(lang, 'remove')}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {embedded ? null : (
            <button type="button" onClick={onBack} className={`min-h-11 self-start text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
              ← {t(lang, 'roster')}
            </button>
          )}
          <InfoTip lang={lang} name="results" text={t(lang, 'guide_results')} />
        </div>
      </div>
      {selectedSlots()}
      {canPin ? (
        <ChangeRequestList
          lang={lang}
          isDarkMode={isDarkMode}
          requests={campaign.config.changeRequests ?? []}
          onResolve={onResolveRequest}
        />
      ) : null}
      {notice && <p className="text-sm font-medium text-[#93ba8c]">{notice}</p>}
      {canPin ? (
        <div className="inline-flex rounded-full p-0.5 glass-well" role="tablist" data-results-tab={resultsView}>
          <button
            type="button"
            role="tab"
            data-results-view="schedule"
            aria-selected={resultsView === 'schedule'}
            onClick={() => setResultsView('schedule')}
            className={`min-h-11 rounded-full px-4 text-xs font-bold ${resultsView === 'schedule' ? 'chip-on' : ''}`}
          >
            {t(lang, 'tab_schedule')}
          </button>
          <button
            type="button"
            role="tab"
            data-results-view="analysis"
            aria-selected={resultsView === 'analysis'}
            onClick={() => setResultsView('analysis')}
            className={`min-h-11 rounded-full px-4 text-xs font-bold ${resultsView === 'analysis' ? 'chip-on' : ''}`}
          >
            {t(lang, 'tab_analysis')}
          </button>
        </div>
      ) : null}
      {canPin && resultsView === 'analysis' ? (
        <AnalysisPanel lang={lang} isDarkMode={isDarkMode} campaign={campaign} sessions={sessions} />
      ) : (
      <>
      <div className="inline-flex rounded-full p-0.5 glass-well" role="tablist" data-pick-mode={pickMode}>
        <button
          type="button"
          role="tab"
          data-pick="manual"
          aria-selected={pickMode === 'manual'}
          onClick={() => setPickMode('manual')}
          className={`min-h-11 rounded-full px-4 text-xs font-bold ${pickMode === 'manual' ? 'chip-on' : ''}`}
        >
          {t(lang, 'pick_manual')}
        </button>
        <button
          type="button"
          role="tab"
          data-pick="suggest"
          aria-selected={pickMode === 'suggest'}
          onClick={() => setPickMode('suggest')}
          className={`min-h-11 rounded-full px-4 text-xs font-bold ${pickMode === 'suggest' ? 'chip-on' : ''}`}
        >
          {t(lang, 'pick_suggest')}
        </button>
      </div>
      {pickMode === 'manual' ? (
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
        <div className="order-2 min-w-0 space-y-3 md:order-1">
          <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
            <h3 className={`inline-flex items-center gap-2 font-medium ${textPrimary(isDarkMode)}`}>
              {t(lang, 'choreographer_filter')}
              <InfoTip
                lang={lang}
                name="organizers"
                text={`${t(lang, 'choreographer_filter_hint')}\n${t(lang, durationUnset ? 'duration_not_set' : 'slots_rule')}`}
              />
            </h3>
            {organizers.length === 0 && <p className="text-sm text-zinc-400">{t(lang, 'list_empty')}</p>}
            {organizers.map((person) => (
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
          {peopleFilters()}
          <HeatBook
            lang={lang}
            isDarkMode={isDarkMode}
            dancers={dancers}
            heat={heat}
            slots={slots}
            savedSlots={campaign.savedSlots}
            sessions={sessions}
            focusId={focusId}
            markFilter={markFilter}
            durationHours={draftHours}
            editable={canSetDuration}
            windowStart={campaign.config.dayStartHour}
            windowEnd={campaign.config.dayEndHour}
            nameOf={nameOf}
            onCommit={commitSession}
            onFocus={focusSession}
            onToggleDay={toggleDay}
            onPaintDays={paintSessionDays}
            onRemove={removeSession}
            onClearAll={() => {
              setSessions([])
              setFocusId(null)
            }}
            filter={<MarkFilterControl lang={lang} value={markFilter} onChange={setMarkFilter} wide />}
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
        </section>
      </div>
      ) : (
      <section className={`${cardClass(isDarkMode)} min-w-0 rounded-[1.5rem] p-4 sm:p-5`}>
          <div>
            <h3 className={`font-serif text-xl sm:text-2xl ${textPrimary(isDarkMode)}`}>
              {selectedDates.size > 0 ? t(lang, 'dates_selected', { n: selectedDates.size }) : t(lang, 'rehearsal_recommendations')}
            </h3>
            {durationUnset ? null : <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'found_slots', { n: listed.length })}</p>}
            {peopleFilters()}
            <div className="mt-4" data-suggest-dates="">
              <div className="mb-3 flex items-center justify-between">
                <h4 className={`inline-flex items-center gap-2 font-bold ${textPrimary(isDarkMode)}`}>
                  {t(lang, 'availability_map')}
                  <InfoTip lang={lang} name="dates" text={t(lang, 'tip_click_dates')} />
                </h4>
                {(selectedDates.size > 0 || minAttendance !== 70) && (
                  <button
                    type="button"
                    className="text-xs font-bold text-[#f19ba8]"
                    onClick={() => {
                      setSelectedDates(new Set())
                      setMinAttendance(70)
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
                selected={[...selectedDates]}
                onSelectRange={(next) => setSelectedDates(new Set(next))}
                renderDay={(day) => {
                  const iso = toISODateString(day)
                  const score = scoreFor(iso)
                  const selected = selectedDates.has(iso)
                  return (
                    <button
                      type="button"
                      data-cal-iso={iso}
                      data-day-on={selected ? '' : undefined}
                      aria-label={formatLongDate(day, lang)}
                      onClick={() => {
                        if (consumeDayClick()) return
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
                <input data-attendance="" type="range" min={0} max={100} step={10} value={minAttendance} onChange={(event) => setMinAttendance(Number(event.target.value))} className="mt-2 w-full accent-[#7c7bb9]" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
            <div data-duration-hours="" className="flex scroll-mt-24 items-center gap-3">
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
            <label className="min-w-[10rem] space-y-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t(lang, 'earliest_start')}
              <select
                data-earliest-start=""
                value={earliestStart ?? ''}
                onChange={(event) => setEarliestStart(event.target.value === '' ? null : Number(event.target.value))}
                className={`w-full min-w-0 rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
              >
                <option value="">{t(lang, 'any_time')}</option>
                {rangeOptions(campaign.config.dayStartHour, Math.max(campaign.config.dayStartHour, campaign.config.dayEndHour - SLOT_STEP)).map((hour) => (
                  <option key={hour} value={hour}>{formatHourOption(hour)}</option>
                ))}
              </select>
            </label>
            </div>
            <div className="mt-6 space-y-4">
              {canPin ? (
                <div className="space-y-2" data-shortlist="">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#f6cf7a]">{t(lang, 'shortlist_title')} ({shortlist.length})</h4>
                    <button
                      type="button"
                      data-confirm-shortlist=""
                      disabled={shortlist.length === 0}
                      onClick={confirmShortlist}
                      className="btn-glow btn-primary min-h-11 rounded-full px-4 text-xs font-bold disabled:opacity-40"
                    >
                      {t(lang, 'confirm_shortlist')}
                    </button>
                  </div>
                  {pinned.map(renderSlot)}
                </div>
              ) : null}
              {others.length > 0 && (
                <div className="space-y-2" data-all-options="">
                  {(canPin || pinned.length > 0) && <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t(lang, 'all_results_title')} ({others.length})</h4>}
                  {others.map(renderSlot)}
                </div>
              )}
              {durationUnset ? (
                <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'choose_length_first')}</p>
              ) : listed.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-medium text-zinc-400">{t(lang, 'no_results')}</p>
                  <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'guide_empty_results')}</p>
                </div>
              ) : null}
            </div>
          </div>
      </section>
      )}
      </>
      )}
      {noteEditor && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setNoteEditor(null)}>
              <form
                role="dialog"
                aria-modal="true"
                data-note-dialog=""
                aria-label={noteEditor.length > 1 ? t(lang, 'batch_edit') : t(lang, 'edit_details')}
                className={`${cardClass(isDarkMode)} w-full max-w-md space-y-3 rounded-[1.5rem] p-4`}
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault()
                  saveNoteEditor()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setNoteEditor(null)
                }}
              >
                <h3 className={`text-base font-semibold ${textPrimary(isDarkMode)}`}>
                  {noteEditor.length > 1 ? t(lang, 'batch_edit') : t(lang, 'edit_details')}
                </h3>
                <label className="block space-y-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {t(lang, 'venue_label')}
                  <input
                    data-venue=""
                    value={editorVenue}
                    onChange={(event) => setEditorVenue(event.target.value)}
                    className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
                  />
                </label>
                <label className="block space-y-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {t(lang, 'remarks_label')}
                  <textarea
                    data-session-remarks=""
                    rows={3}
                    value={editorRemarks}
                    onChange={(event) => setEditorRemarks(event.target.value)}
                    className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setNoteEditor(null)} className="glass-well min-h-11 rounded-full px-4 text-xs font-bold">
                    {t(lang, 'cancel')}
                  </button>
                  <button type="submit" data-save-details="" className="btn-glow btn-primary min-h-11 rounded-full px-4 text-xs font-bold">
                    {t(lang, 'save_details')}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
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
  if (score >= 90) return 'bg-[color:var(--logo-purple)] text-white'
  if (score >= 70) return 'bg-[#93ba8c] text-white'
  if (score >= 50) return 'bg-[#f6cf7a] text-zinc-900'
  if (score > 0) return isDarkMode ? 'bg-white/10 text-zinc-200' : 'bg-white text-zinc-600'
  return isDarkMode ? 'bg-black/30 text-zinc-500' : 'bg-zinc-100 text-zinc-400'
}
