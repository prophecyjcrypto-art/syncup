import { readFileSync } from 'node:fs'
import { getDaysArray, groupByMonth, parseISODate, setTime, toISODateString } from '../src/lib/dates.ts'
import { availabilityHeatmap, calculateBestSlots, coveredMs, freeIntervals, markedBlockCount, markedHours, normalizeDurationHours, plannedSessionHours, responseCount, shortlistSessionHours, uncoveredDays } from '../src/lib/schedule.ts'
import { analyzeEvent } from '../src/lib/analysis.ts'
import { devResultsAllowed, isDevResultsPath } from '../src/lib/devPreview.ts'
import { buildCampaign, sampleShortlist } from '../src/dev/resultsPreview.tsx'
import { commitSessions, pinsToSave, type SessionRange } from '../src/lib/sessions.ts'
import {
  durationFromCellCount,
  durationHours,
  formatClock,
  fitDuration,
  moveHourRange,
  parseClock,
  rangeFromCellIndexes,
  rangeFromDrag,
  resizeHourRange,
} from '../src/lib/timeRange.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const day = '2026-10-05'
function block(start: number, end: number, kind: 'available' | 'unavailable') {
  const date = parseISODate(day)
  return { start: setTime(date, start), end: setTime(date, end), kind }
}

const config = {
  startDate: day,
  endDate: day,
  durationHours: 3,
  dayStartHour: 9,
  dayEndHour: 22,
  attendanceTolerance: 0.5,
}

const naOnly = { id: 'd1', blocks: [block(10, 12, 'unavailable' as const)] }
const slots = calculateBestSlots(config, [], [naOnly])
const nine = slots.find((slot) => slot.start.getHours() === 9 && slot.start.getMinutes() === 0)
const noon = slots.find((slot) => slot.start.getHours() === 12 && slot.start.getMinutes() === 0)
assert(Boolean(nine?.unavailableMembers.some((member) => member.id === 'd1')), 'NA overlap should block the morning slot')
assert(Boolean(noon?.availableMembers.includes('d1')), 'time after NA should stay free')

const bothStart = setTime(parseISODate(day), 9).getTime()
const bothEnd = setTime(parseISODate(day), 12).getTime()
const covered = coveredMs(
  freeIntervals(
    { id: 'd2', blocks: [block(9, 13, 'available'), block(10, 11, 'unavailable')] },
    bothStart,
    bothEnd,
  ),
)
assert(covered === 2 * 60 * 60 * 1000, 'OK minus overlapping NA should leave 2 hours')

const blocked = calculateBestSlots(config, [{ id: 'c1', blocks: [block(9, 22, 'unavailable')] }], [naOnly])
assert(blocked.length === 0, 'an all-day NA organizer removes every slot')

const evening = calculateBestSlots(config, [{ id: 'c2', blocks: [block(18, 22, 'available')] }], [])
assert(evening.length > 0 && evening.every((slot) => slot.start.getHours() >= 18), 'only evening slots remain')

const open = calculateBestSlots(config, [], [{ id: 'd4', blocks: [] }])
assert(open.every((slot) => slot.availableMembers.includes('d4')), 'an empty schedule is free all day')

const unset = calculateBestSlots({ ...config, durationHours: null }, [], [naOnly])
assert(unset.length === 0, 'a missing duration does not invent sessions')
assert(normalizeDurationHours(3) === 3, 'an existing duration stays a number')
assert(normalizeDurationHours(null) === null, 'null duration stays unset')
assert(normalizeDurationHours(undefined) === null, 'a missing duration stays unset')
assert(normalizeDurationHours('2.5') === 2.5, 'numeric strings still count as a duration')
assert(normalizeDurationHours(0) === null, 'zero is not a session length')

const heat = availabilityHeatmap({ ...config, dayEndHour: 12 }, [naOnly, { id: 'd4', blocks: [] }], [day])
assert(heat.length === 1 && heat[0].cells.length === 6, 'heatmap uses half-hour cells inside the daily window')
assert(heat[0].cells[0].freeIds.length === 2, 'both dancers are free before the NA block')
assert(
  heat[0].cells[2].freeIds.length === 1 && heat[0].cells[2].freeIds[0] === 'd4',
  'a dancer marked NA drops out of that overlap cell',
)
const ranked = calculateBestSlots({ ...config, durationHours: 1, dayEndHour: 12 }, [], [naOnly, { id: 'd4', blocks: [] }])
assert(ranked[0]?.start.getHours() === 9, 'the fullest hour is offered before a thinner one')

const october = getDaysArray(parseISODate('2026-10-01'), parseISODate('2026-10-07'))
const months = groupByMonth(october, 'en')
const thursday = months[0].cells[3]
assert(thursday !== null && toISODateString(thursday) === '2026-10-01', '1 Oct 2026 lines up on Thursday')
const sequenced = months[0].cells.slice(3, 10)
assert(
  sequenced.every((cell, index) => cell !== null && toISODateString(cell) === toISODateString(october[index])),
  'days stay in date order',
)

const mixedGap = uncoveredDays(config, [block(9, 12, 'available'), block(18, 22, 'unavailable')])
assert(mixedGap.includes(day), 'both kinds leave an unmarked gap on the day')

const mixedFull = uncoveredDays(config, [block(9, 18, 'available'), block(18, 22, 'unavailable')])
assert(mixedFull.length === 0, 'both kinds are complete when the daily range is covered')

const naGap = uncoveredDays(config, [block(10, 12, 'unavailable')])
assert(naGap.length === 0, 'NA only does not require the other days to be filled')

const dragged = rangeFromCellIndexes(9, 20, 24)
assert(dragged.startHour === 19 && dragged.endHour === 21.5, 'dragging 19:00 through the 21:00 cell ends at 21:30')
assert(durationHours(dragged) === 2.5, 'that range lasts 2.5 hours')
assert(formatClock(dragged.startHour) === '19:00' && formatClock(dragged.endHour) === '21:30', 'the range reads 19:00–21:30')
const fromDrag = rangeFromDrag({ kind: 'create', origin: 20 }, 24, 9, 22)
assert(durationHours(fromDrag) === 2.5, 'a create-drag across those cells is 2.5 hours')
const moved = moveHourRange(dragged, 1, 9, 22)
assert(moved.startHour === 19.5 && moved.endHour === 22 && durationHours(moved) === 2.5, 'moving the block later keeps the 2.5 hour length')
const clamped = moveHourRange(dragged, 20, 9, 22)
assert(clamped.endHour === 22 && durationHours(clamped) === 2.5, 'a move stays inside the day and keeps its length')
const shorter = resizeHourRange(dragged, 'end', -1, 9, 22)
assert(shorter.endHour === 21 && durationHours(shorter) === 2, 'shortening the end by one slot drops half an hour')
const earlier = resizeHourRange(dragged, 'start', -2, 9, 22)
assert(earlier.startHour === 18 && earlier.endHour === 21.5, 'the start can move earlier without changing the end')
assert(parseClock('19:00') === 19 && parseClock('21:30') === 21.5, 'typed times parse to hours')
assert(parseClock('02:00+1') === 26, 'a next-day time parses past midnight')
assert(durationFromCellCount(5) === 2.5, 'five half-hour cells are 2.5 hours')
const fitted = fitDuration({ startHour: 18, endHour: 20 }, 1.5, 9, 22)
assert(fitted.startHour === 18 && fitted.endHour === 19.5, 'a shorter length keeps the start and moves the end')
const shifted = fitDuration({ startHour: 21, endHour: 22 }, 2, 9, 22)
assert(shifted.startHour === 20 && shifted.endHour === 22 && durationHours(shifted) === 2, 'a length that would pass the day end shifts earlier')

const legacyHeat = availabilityHeatmap(config, [naOnly], [day])
const bothHeat = availabilityHeatmap(config, [naOnly], [day], 'both')
assert(
  legacyHeat[0].cells.every((cell, index) => cell.freeIds.join() === bothHeat[0].cells[index].freeIds.join()),
  'the default overlap stays the usual schedule when no mark filter is set',
)
const naHeat = availabilityHeatmap({ ...config, dayEndHour: 12 }, [naOnly], [day], 'na')
assert(naHeat[0].cells[0].freeIds.length === 0, '9:00 is not an NA mark')
assert(naHeat[0].cells[2].freeIds.includes('d1'), '10:00 counts the NA mark')
const okHeat = availabilityHeatmap({ ...config, dayEndHour: 14 }, [{ id: 'd2', blocks: [block(9, 13, 'available')] }], [day], 'ok')
assert(okHeat[0].cells[0].freeIds.includes('d2'), 'an OK mark shows in that half hour')
assert(!okHeat[0].cells[okHeat[0].cells.length - 1].freeIds.includes('d2'), 'OK mode ignores time that was not marked OK')

assert(markedBlockCount([naOnly], 'unavailable') === 1, 'NA count is the marked block, not a rewritten schedule')
assert(markedHours(config, [naOnly], 'unavailable') === 2, 'that NA block is 2 hours inside the day')
assert(responseCount([naOnly, { id: 'd4', blocks: [] }]) === 1, 'only people who saved a time count as responses')
assert(plannedSessionHours(null, ['existing'], []) === 0, 'a shortlist without a duration does not invent hours from nowhere')
assert(plannedSessionHours(2, ['existing', 'existing'], []) === 2, 'duplicate shortlist keys are not double counted')
assert(plannedSessionHours(null, [], [{ startHour: 19, endHour: 21.5 }]) === 2.5, 'grid sessions supply hours when nothing is shortlisted')
assert(shortlistSessionHours(2, ['a', 'a', 'b']) === 4, 'schedule shows each shortlisted session once')
assert(shortlistSessionHours(2, []) === null && shortlistSessionHours(null, ['a']) === null, 'schedule hides session hours when nothing is shortlisted')

const morningSession: SessionRange = { id: 'one', iso: day, startHour: 9, endHour: 11 }
const eveningSession: SessionRange = { id: 'two', iso: day, startHour: 19, endHour: 21.5 }
const originalSessions = [morningSession]
const addedSessions = commitSessions(originalSessions, eveningSession, null)
assert(originalSessions.length === 1 && originalSessions[0].id === 'one', 'booking another slot does not rewrite the existing session')
assert(addedSessions.sessions.length === 2, 'one day can hold two sessions')
const redrawn = commitSessions(addedSessions.sessions, { id: 'three', iso: day, startHour: 18, endHour: 20 }, null)
assert(redrawn.sessions.length === 2 && redrawn.sessions.some((item) => item.id === 'two' && item.startHour === 18), 'redrawing over a slot updates that slot')
assert(redrawn.sessions.some((item) => item.id === 'one'), 'the other slot on that day stays')
const movedSession = commitSessions(addedSessions.sessions, { ...morningSession, startHour: 12, endHour: 14 }, 'one')
assert(movedSession.sessions.length === 2 && movedSession.sessions.some((item) => item.id === 'two'), 'moving one slot leaves the other in place')

assert(pinsToSave(true, ['kept', 'also'], []) === null, 'an empty grid does not rewrite the shortlist')
assert(pinsToSave(false, ['kept'], ['new']) === null, 'someone who cannot pin does not write')
assert(pinsToSave(true, ['kept'], ['kept']) === null, 'an existing shortlist key is not written again')
const pinned = pinsToSave(true, ['kept'], ['fresh'])
assert(pinned?.join() === 'kept,fresh', 'a new session is added after the times already saved')

const migration = readFileSync(new URL('../supabase/migrations/20261113120000_dance_groups.sql', import.meta.url), 'utf8')
assert(/create table public\.hupaak_groups/i.test(migration), 'groups table is created')
assert(/create table public\.hupaak_group_members/i.test(migration), 'group membership is created')
assert(!/\bdrop\b/i.test(migration), 'group migration does not drop anything')
assert(!/\btruncate\b/i.test(migration), 'group migration does not truncate')
assert(!/\bdelete\s+from\b/i.test(migration), 'group migration does not delete rows')
assert(!/\bupdate\s+public\.hupaak_/i.test(migration), 'group migration does not rewrite existing tables')
assert(!/insert\s+into\s+public\.hupaak_(campaigns|people|blocks|admins|access)/i.test(migration), 'group migration does not insert into existing tables')
assert(!/alter\s+table\s+public\.hupaak_(campaigns|people|blocks|admins|access)/i.test(migration), 'group migration does not alter existing tables')

const dbSource = readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8')
const campaignSelect = dbSource.match(/const campaignSelect = `([\s\S]*?)`/)
assert(campaignSelect != null && !campaignSelect[1].includes('hupaak_groups'), 'loading an event does not depend on the groups table')
const groupWrites = dbSource.slice(dbSource.indexOf('export async function createDanceGroup'))
assert(groupWrites.includes('hupaak_groups') && !groupWrites.includes('hupaak_people'), 'group edits do not rewrite people')
assert(!groupWrites.includes('hupaak_blocks') && !groupWrites.includes('hupaak_campaigns'), 'group edits do not rewrite blocks or events')

assert(devResultsAllowed(true, undefined) === true, 'local dev can open the results preview')
assert(devResultsAllowed(false, 'preview') === true, 'a Vercel preview build can open the results preview')
assert(devResultsAllowed(false, 'production') === false, 'production cannot open the results preview')
assert(devResultsAllowed(false, undefined) === false, 'a build without Vercel preview cannot open the results preview')
assert(isDevResultsPath('/dev/results') && isDevResultsPath('/dev/results/'), 'the preview lives at /dev/results')
assert(!isDevResultsPath('/') && !isDevResultsPath('/dev/results/extra'), 'other paths are not the preview')

const sample = buildCampaign('zh', sampleShortlist(), 2)
assert(sample.groups.map((group) => group.name).join() === '主力,後備', 'the sample has a main group and a reserve group')
assert(sample.savedSlots.length === 2, 'the sample shortlist has two times on one day')
assert(new Set(sample.savedSlots.map((key) => toISODateString(new Date(key)))).size === 1, 'those two saved times are on the same day')
assert(sample.dancers.some((dancer) => dancer.blocks.length === 0), 'one dancer has not responded')
assert(sample.dancers.some((dancer) => dancer.blocks.some((block) => block.kind === 'unavailable')), 'the sample includes NA')
assert(sample.dancers.some((dancer) => dancer.blocks.some((block) => block.kind === 'available')), 'the sample includes OK')

const previewSource = readFileSync(new URL('../src/dev/resultsPreview.tsx', import.meta.url), 'utf8')
assert(!previewSource.includes('lib/db') && !previewSource.includes('lib/supabase') && !previewSource.includes('fetchCampaigns'), 'the preview cannot read or write live events')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
assert(!appSource.includes('/dev/results'), 'the signed-in app does not link to the preview')
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
assert(mainSource.includes('__SYNCUP_DEV_RESULTS__') && !/searchParams\.get\(\s*['"]dev['"]\s*\)/.test(mainSource), 'the preview is not unlocked by a public query secret')
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
assert(viteConfig.includes('devResultsAllowed'), 'the Vite build uses the same preview gate')

const quiet = analyzeEvent({
  config,
  dancers: [],
  choreographers: [],
  groups: [],
  savedSlots: ['leave-this'],
  sessions: [],
})
assert(quiet.naCount === 0 && quiet.okCount === 0 && quiet.responses === 0 && quiet.people === 0, 'an event with no dancers has empty counts')
assert(quiet.groups.length === 0 && quiet.ungrouped === null && quiet.sessions.length === 0, 'no groups stays an empty analysis')
assert(quiet.sessionHours === 3, 'a shortlist still counts session hours when duration is set')

const waiting = analyzeEvent({
  config,
  dancers: [
    {
      id: 'solo',
      userId: null,
      name: 'Solo',
      email: '',
      role: 'dancer',
      blocks: [],
      lastUpdated: null,
    },
  ],
  choreographers: [],
  groups: [],
  savedSlots: [],
  sessions: [{ iso: day, startHour: 12, endHour: 14.5 }],
})
assert(waiting.responses === 0 && waiting.waiting.length === 1 && waiting.replied.length === 0, 'a dancer with no marks is waiting')
assert(waiting.sessionHours === 2.5 && waiting.sessions.length === 1, 'one grid session is enough for the analysis')
assert(waiting.days.length === 1 && waiting.days[0].freePeak === 1, 'an empty schedule is free across the day')

const markedPerson = {
  id: 'ada',
  userId: null,
  name: 'Ada',
  email: '',
  role: 'dancer' as const,
  blocks: [block(10, 12, 'unavailable'), block(14, 18, 'available')].map((item, index) => ({
    ...item,
    id: `ada-${index}`,
    wholeDay: false,
  })),
  lastUpdated: null,
}
const grouped = analyzeEvent({
  config,
  dancers: [
    markedPerson,
    {
      id: 'solo',
      userId: null,
      name: 'Solo',
      email: '',
      role: 'dancer' as const,
      blocks: [],
      lastUpdated: null,
    },
  ],
  choreographers: [],
  groups: [{ id: 'main', name: 'Main', memberIds: ['ada'] }],
  savedSlots: [],
  sessions: [],
})
assert(grouped.naCount === 1 && grouped.okCount === 1, 'NA and OK counts stay the marked blocks')
assert(grouped.groups.length === 1 && grouped.groups[0].naHours === 2 && grouped.groups[0].okHours === 4, 'group hours follow that dancer')
assert(grouped.ungrouped?.people === 1, 'dancers outside a group stay visible')
assert(grouped.responses === 1 && grouped.waiting.length === 1, 'coverage splits replies from people who have not saved')

console.log('schedule checks passed')
