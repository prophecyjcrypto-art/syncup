import type { AppConfig, DanceGroup, Person } from '../types'
import { getDaysArray, parseISODate, setTime, toISODateString } from './dates'
import {
  availabilityHeatmap,
  calculateBestSlots,
  coveredMs,
  freeIntervals,
  markedBlockCount,
  markedHours,
  mergeRanges,
  plannedSessionHours,
  responseCount,
} from './schedule'
import { roundHour } from './timeRange'
import type { TimeSlot } from '../types'

export interface AnalysisPerson {
  id: string
  name: string
  replied: boolean
  okHours: number
  naHours: number
  attendedHours: number
}

export interface AnalysisGroup {
  id: string
  name: string
  people: number
  okHours: number
  naHours: number
  sessionHours: number
}

export interface AnalysisDay {
  iso: string
  freePeak: number
  total: number
}

export interface AnalysisSession {
  id: string
  iso: string
  start: Date
  end: Date
  hours: number
  groups: { id: string; name: string; free: number; total: number }[]
}

export interface EventAnalysis {
  naCount: number
  okCount: number
  responses: number
  people: number
  sessionHours: number
  hasShortlist: boolean
  replied: AnalysisPerson[]
  waiting: AnalysisPerson[]
  dancers: AnalysisPerson[]
  groups: AnalysisGroup[]
  ungrouped: AnalysisGroup | null
  days: AnalysisDay[]
  sessions: AnalysisSession[]
}

interface GridSession {
  iso: string
  startHour: number
  endHour: number
}

function hoursBetween(start: Date, end: Date): number {
  return roundHour((end.getTime() - start.getTime()) / 3600000)
}

function inGroup(group: { memberIds: string[] }, dancers: Person[]): Person[] {
  const ids = new Set(group.memberIds)
  return dancers.filter((person) => ids.has(person.id))
}

function matchesSession(slot: TimeSlot, session: GridSession): boolean {
  if (toISODateString(slot.start) !== session.iso) return false
  const midnight = parseISODate(session.iso).getTime()
  const startHour = roundHour((slot.start.getTime() - midnight) / 3600000)
  const endHour = roundHour((slot.end.getTime() - midnight) / 3600000)
  return startHour === session.startHour && endHour === session.endHour
}

function attendedHours(person: Person, sessions: PlannedSession[]): number {
  if (sessions.length === 0) return 0
  const pieces = sessions.flatMap((session) => freeIntervals(person, session.start.getTime(), session.end.getTime()))
  return Math.round((coveredMs(mergeRanges(pieces)) / 3600000) * 10) / 10
}

function freeDuring(people: Person[], start: Date, end: Date): string[] {
  const span = end.getTime() - start.getTime()
  if (span <= 0) return []
  return people
    .filter((person) => coveredMs(freeIntervals(person, start.getTime(), end.getTime())) >= span - 1000)
    .map((person) => person.id)
}

interface PlannedSession {
  id: string
  start: Date
  end: Date
  freeIds: string[]
}

/** Read-only figures for the organizer analysis tab. Does not change the event. */
export function analyzeEvent(input: {
  config: AppConfig
  dancers: Person[]
  choreographers: Person[]
  groups: DanceGroup[]
  savedSlots: string[]
  sessions: GridSession[]
}): EventAnalysis {
  const dancers = input.dancers
  const saved = [...new Set(input.savedSlots)]
  const useSaved = saved.length > 0 && input.config.durationHours != null && input.config.durationHours > 0
  const slots = calculateBestSlots(input.config, input.choreographers, dancers)
  const chosen: PlannedSession[] = useSaved
    ? saved.flatMap((key) => {
        const match = slots.find((slot) => slot.start.toISOString() === key)
        if (match) return [{ id: key, start: match.start, end: match.end, freeIds: match.availableMembers }]
        const start = new Date(key)
        if (Number.isNaN(start.getTime())) return []
        const end = new Date(start.getTime() + (input.config.durationHours ?? 0) * 3600000)
        return [{ id: key, start, end, freeIds: freeDuring(dancers, start, end) }]
      })
    : input.sessions.map((session) => {
        const start = setTime(parseISODate(session.iso), session.startHour)
        const end = setTime(parseISODate(session.iso), session.endHour)
        const match = slots.find((slot) => matchesSession(slot, session))
        return { id: `${session.iso}-${session.startHour}`, start, end, freeIds: match ? match.availableMembers : freeDuring(dancers, start, end) }
      })

  const people = dancers.map((person) => ({
    id: person.id,
    name: person.name,
    replied: person.blocks.length > 0,
    okHours: markedHours(input.config, [person], 'available'),
    naHours: markedHours(input.config, [person], 'unavailable'),
    attendedHours: useSaved ? attendedHours(person, chosen) : 0,
  }))

  function groupSessionHours(members: Person[]): number {
    if (members.length === 0 || chosen.length === 0) return 0
    const ids = new Set(members.map((person) => person.id))
    const total = chosen.reduce((sum, slot) => {
      const free = slot.freeIds.filter((id) => ids.has(id)).length
      return sum + hoursBetween(slot.start, slot.end) * (free / members.length)
    }, 0)
    return Math.round(total * 10) / 10
  }

  const groups = input.groups.map((group) => {
    const members = inGroup(group, dancers)
    return {
      id: group.id,
      name: group.name,
      people: members.length,
      okHours: markedHours(input.config, members, 'available'),
      naHours: markedHours(input.config, members, 'unavailable'),
      sessionHours: groupSessionHours(members),
    }
  })
  const groupedIds = new Set(input.groups.flatMap((group) => group.memberIds))
  const outside = input.groups.length > 0 ? dancers.filter((person) => !groupedIds.has(person.id)) : []
  const dates = getDaysArray(parseISODate(input.config.startDate), parseISODate(input.config.endDate)).map((day) => toISODateString(day))
  const heat = dancers.length === 0 ? [] : availabilityHeatmap(input.config, dancers, dates)

  return {
    naCount: markedBlockCount(dancers, 'unavailable'),
    okCount: markedBlockCount(dancers, 'available'),
    responses: responseCount(dancers),
    people: dancers.length,
    sessionHours: plannedSessionHours(input.config.durationHours, input.savedSlots, input.sessions),
    hasShortlist: useSaved,
    replied: people.filter((person) => person.replied),
    waiting: people.filter((person) => !person.replied),
    dancers: people,
    groups,
    ungrouped:
      outside.length > 0
        ? {
            id: 'ungrouped',
            name: '',
            people: outside.length,
            okHours: markedHours(input.config, outside, 'available'),
            naHours: markedHours(input.config, outside, 'unavailable'),
            sessionHours: groupSessionHours(outside),
          }
        : null,
    days: heat.map((day) => ({
      iso: day.iso,
      freePeak: day.cells.reduce((max, cell) => Math.max(max, cell.freeIds.length), 0),
      total: dancers.length,
    })),
    sessions: chosen.map((slot) => ({
      id: slot.id,
      iso: toISODateString(slot.start),
      start: slot.start,
      end: slot.end,
      hours: hoursBetween(slot.start, slot.end),
      groups: input.groups.map((group) => {
        const members = inGroup(group, dancers)
        const ids = new Set(members.map((person) => person.id))
        return {
          id: group.id,
          name: group.name,
          free: slot.freeIds.filter((id) => ids.has(id)).length,
          total: members.length,
        }
      }),
    })),
  }
}
