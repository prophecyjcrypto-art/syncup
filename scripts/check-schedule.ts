import { readFileSync } from 'node:fs'
import { formatHourCount, formatPeopleCount } from '../src/i18n.ts'
import { getDaysArray, groupByMonth, parseISODate, setTime, toISODateString } from '../src/lib/dates.ts'
import { availabilityHeatmap, calculateBestSlots, classifySessionWindow, coveredMs, freeIntervals, markedBlockCount, markedHours, normalizeDurationHours, plannedSessionHours, responseCount, shortlistSessionHours, uncoveredDays } from '../src/lib/schedule.ts'
import { analyzeEvent } from '../src/lib/analysis.ts'
import { devResultsAllowed, isDevHubPath, isDevResultsPath } from '../src/lib/devPreview.ts'
import { membershipChanges } from '../src/lib/groups.ts'
import { canEditEvent, canSeeResults } from '../src/lib/access.ts'
import { emailForAdminGrant, grantRole } from '../src/lib/roles.ts'
import { paintBlocks, spansFromDrag } from '../src/lib/paint.ts'
import { SHORT_CODE_ALPHABET, normalizeLongCode, normalizeShortCode, parseInviteInput, shortCodeFromPath } from '../src/lib/invites.ts'
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
assert(
  Boolean(nine?.partialMembers.some((member) => member.id === 'd1' && member.earlyMins === 120)),
  'a morning overlap that misses more than the buffer is partial, not NA',
)
assert(!nine?.unavailableMembers.some((member) => member.id === 'd1'), 'partial overlap is not filed under NA')
assert(nine?.score === 1, 'partial overlap still counts as able to attend')
assert(Boolean(noon?.availableMembers.includes('d1')), 'time after NA should stay free')

const dec8 = '2026-12-08'
function onDay(iso: string, start: number, end: number, kind: 'available' | 'unavailable') {
  const date = parseISODate(iso)
  return { start: setTime(date, start), end: setTime(date, end), kind }
}
const chelsea = { id: 'chelsea', blocks: [onDay(dec8, 15, 17, 'unavailable')] }
const noOverlap = { id: 'absent', blocks: [onDay(dec8, 10, 17, 'unavailable')] }
const fullyFree = { id: 'free', blocks: [] as typeof chelsea.blocks }
const startsLater = { id: 'late-start', blocks: [onDay(dec8, 10, 11, 'unavailable')] }
const shortlistStart = setTime(parseISODate(dec8), 10)
const shortlistEnd = setTime(parseISODate(dec8), 16.5)
const chelseaWindow = classifySessionWindow([chelsea, noOverlap, fullyFree], shortlistStart, shortlistEnd, 0)
const chelseaPartial = chelseaWindow.partialMembers.find((member) => member.id === 'chelsea')
assert(
  chelseaPartial?.earlyMins === 90 && chelseaPartial.lateMins === 0,
  '10:00–16:30 with buffer 0 and free until 15:00 is partial, early 90m',
)
assert(!chelseaWindow.unavailableMembers.some((member) => member.id === 'chelsea'), 'Chelsea is not NA')
assert(!chelseaWindow.availableMembers.includes('chelsea'), 'Chelsea is not fully OK')
assert(chelseaWindow.unavailableMembers.some((member) => member.id === 'absent'), 'no overlap on that session is NA')
assert(
  !chelseaWindow.availableMembers.includes('absent') && !chelseaWindow.partialMembers.some((member) => member.id === 'absent'),
  'no overlap is never OK or partial',
)
assert(chelseaWindow.availableMembers.includes('free'), 'someone free for the whole session is OK')
assert(chelseaWindow.score === 2, 'the session score counts OK and partial')

const suggestedHour = {
  startDate: dec8,
  endDate: dec8,
  durationHours: 1,
  dayStartHour: 10,
  dayEndHour: 17,
  attendanceTolerance: 0,
}
const longCards = calculateBestSlots({ ...suggestedHour, durationHours: 6.5 }, [], [chelsea, noOverlap, fullyFree])
const longCard = longCards.find((slot) => slot.start.getHours() === 10 && slot.start.getMinutes() === 0)
assert(longCard?.end.getHours() === 16 && longCard.end.getMinutes() === 30, 'a 6.5 hour length produces the 10:00–16:30 card')
assert(
  Boolean(longCard?.partialMembers.some((member) => member.id === 'chelsea' && member.earlyMins === 90)),
  'the 6.5 hour card keeps Chelsea under partial',
)
const hourSlot = calculateBestSlots(suggestedHour, [], [startsLater]).find(
  (slot) => slot.start.getHours() === 10 && slot.start.getMinutes() === 0,
)
assert(hourSlot?.unavailableMembers.some((member) => member.id === 'late-start'), 'the 1 hour suggestion still marks 10:00–11:00 as NA')
const customShortlist = analyzeEvent({
  config: suggestedHour,
  dancers: [chelsea, noOverlap, fullyFree, startsLater].map((person) => ({
    id: person.id,
    userId: null,
    name: person.id,
    email: '',
    role: 'dancer' as const,
    blocks: person.blocks.map((item, index) => ({ ...item, id: `${person.id}-${index}`, wholeDay: false })),
    lastUpdated: null,
  })),
  choreographers: [],
  groups: [{ id: 'main', name: 'Main', memberIds: ['chelsea', 'absent', 'free', 'late-start'] }],
  savedSlots: [],
  sessions: [{ iso: dec8, startHour: 10, endHour: 16.5 }],
})
const customFree = customShortlist.sessions[0]?.groups[0]?.free
assert(
  customFree === 3,
  `a 6.5 hour shortlist on a 1 hour event uses the long window, not the 1 hour slot (${customFree})`,
)

const fifteenLate = classifySessionWindow(
  [{ id: 'late15', blocks: [block(10, 10.25, 'unavailable')] }],
  setTime(parseISODate(day), 10),
  setTime(parseISODate(day), 13),
  1,
)
assert(fifteenLate.availableMembers.includes('late15'), '15 minutes late inside a 1 hour buffer is OK')
assert(
  !fifteenLate.partialMembers.some((member) => member.id === 'late15') &&
    !fifteenLate.unavailableMembers.some((member) => member.id === 'late15'),
  'that late arrival is not partial or NA',
)

const wideBuffer = classifySessionWindow(
  [{ id: 'gone', blocks: [block(9, 12, 'unavailable')] }],
  setTime(parseISODate(day), 9),
  setTime(parseISODate(day), 11),
  5,
)
assert(!wideBuffer.availableMembers.includes('gone'), 'a buffer longer than the session does not make a fully absent person OK')
assert(!wideBuffer.partialMembers.some((member) => member.id === 'gone'), 'a fully absent person is not partial')
assert(wideBuffer.unavailableMembers.some((member) => member.id === 'gone'), 'a fully absent person stays NA')

const midGap = classifySessionWindow(
  [{ id: 'gap', blocks: [block(11, 12, 'unavailable')] }],
  setTime(parseISODate(day), 10),
  setTime(parseISODate(day), 13),
  0,
)
const gapRow = midGap.partialMembers.find((member) => member.id === 'gap')
assert(
  gapRow?.missingMins === 60 && gapRow.lateMins === 0 && gapRow.earlyMins === 0,
  'a mid-session gap stays partial and reports the missing minutes',
)
assert(!midGap.unavailableMembers.some((member) => member.id === 'gap'), 'a gap with some free time is not NA')

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
assert(normalizeDurationHours('') === null, 'choosing Not set yet yields null')
assert(normalizeDurationHours('1.5') === 1.5, 'choosing 1.5 hours keeps that length')
assert(formatHourCount('en', 1) === '1 hour' && formatHourCount('en', 0.5) === '0.5 hours' && formatHourCount('en', 1.5) === '1.5 hours', 'English hours agree in number')
assert(formatHourCount('zh', 1) === '1 小時' && formatHourCount('zh', 1.5) === '1.5 小時', 'Chinese hours do not pluralize')
assert(formatPeopleCount('en', 1) === '1 person' && formatPeopleCount('en', 2) === '2 people', 'English people agree in number')
assert(formatPeopleCount('zh', 1) === '1 人', 'Chinese people count stays 人')
const setupUi = readFileSync(new URL('../src/components/SetupPanel.tsx', import.meta.url), 'utf8')
assert(setupUi.includes('<option value="">{t(lang, \'duration_unset\')}</option>'), 'Not set yet is always in the duration list')
assert(setupUi.includes('normalizeDurationHours(event.target.value)'), 'the duration select clears through the null parser')
for (const file of ['InviteCode.tsx', 'SetupPanel.tsx', 'OrganizerPortal.tsx', 'RosterPanel.tsx', 'CampaignList.tsx']) {
  const source = readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
  assert(!source.includes('rotate_invite') && !source.includes('onRotate'), `${file} does not offer a replacement invite code`)
}

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
assert(!isDevResultsPath('/') && !isDevResultsPath('/dev/results/extra') && !isDevResultsPath('/dev'), 'other paths are not the results preview')
assert(isDevHubPath('/dev') && isDevHubPath('/dev/'), 'the login-free mock lives at /dev')
assert(!isDevHubPath('/dev/results') && !isDevHubPath('/') && !isDevHubPath('/dev/extra'), 'only /dev opens the product mock')
assert(shortCodeFromPath('/dev') === null, 'the mock path is not an invite')

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
assert(mainSource.includes('isDevHubPath') && mainSource.includes("mockAllowed && (previewName || hubPath)"), 'the product mock uses the same preview build gate')
assert(!mainSource.includes('import.meta.env.DEV'), 'a hosted preview is not limited to the Vite dev server')
const fixtureSource = readFileSync(new URL('../src/dev/fixture.tsx', import.meta.url), 'utf8')
assert(!fixtureSource.includes('lib/db') && !fixtureSource.includes('lib/supabase') && !fixtureSource.includes('fetchCampaigns'), 'the product mock cannot read or write live events')
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
assert(waiting.hasShortlist === false && waiting.dancers[0]?.attendedHours === 0, 'attended hours stay empty until a time is shortlisted')
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

const noonKey = setTime(parseISODate(day), 12).toISOString()
const attended = analyzeEvent({
  config: { ...config, durationHours: 2 },
  dancers: [
    { id: 'free', userId: null, name: 'Free', email: '', role: 'dancer', blocks: [], lastUpdated: null },
    {
      id: 'late',
      userId: null,
      name: 'Late',
      email: '',
      role: 'dancer',
      blocks: [{ ...block(12, 13, 'unavailable'), id: 'late-na', wholeDay: false }],
      lastUpdated: null,
    },
    {
      id: 'out',
      userId: null,
      name: 'Out',
      email: '',
      role: 'dancer',
      blocks: [{ ...block(12, 14, 'unavailable'), id: 'out-na', wholeDay: false }],
      lastUpdated: null,
    },
  ],
  choreographers: [],
  groups: [],
  savedSlots: [noonKey, noonKey],
  sessions: [],
})
assert(attended.hasShortlist && attended.sessionHours === 2, 'duplicate shortlist keys count as one session')
const freeHours = attended.dancers.find((person) => person.id === 'free')?.attendedHours
const lateHours = attended.dancers.find((person) => person.id === 'late')?.attendedHours
const outHours = attended.dancers.find((person) => person.id === 'out')?.attendedHours
assert(freeHours === 2, `a fully free dancer attends the whole shortlist (${freeHours})`)
assert(lateHours === 1, `partial overlap counts only the free part (${lateHours})`)
assert(outHours === 0, `a dancer who is NA for the session attends 0 (${outHours})`)

assert(SHORT_CODE_ALPHABET.length === 32, 'short codes use 32 symbols')
assert(!/[ILOU]/.test(SHORT_CODE_ALPHABET), 'generated codes omit I, L, O, and U')
assert(normalizeShortCode('7k2mq9p') === '7K2MQ9P', 'short codes ignore case')
assert(normalizeShortCode('il0o234') === '1100234', 'a misread I, L, or O still matches')
assert(normalizeShortCode('7K2MQUP') === null, 'U is not a short-code character')
const longCode = 'aabbccddeeff00112233445566778899'
assert(normalizeLongCode(longCode) === longCode, 'an existing 32-hex code still parses')
assert(normalizeLongCode('aa-bb-cc-dd-ee-ff-00-11-22-33-44-55-66-77-88-99') === longCode, 'dashed 32-hex codes still parse')
const adminLink = parseInviteInput(`https://syncup-time.com/?admin=${longCode}`)
const organizerLink = parseInviteInput(`https://syncup-time.com/?organizer=${longCode}`)
const participantLink = parseInviteInput(`https://syncup-time.com/?participant=${longCode}`)
assert(adminLink?.kind === 'admin' && adminLink.code === longCode, 'old admin urls keep working')
assert(organizerLink?.kind === 'organizer' && organizerLink.code === longCode, 'old organizer urls keep working')
assert(participantLink?.kind === 'participant' && participantLink.code === longCode, 'old participant urls keep working')
assert(parseInviteInput(longCode)?.kind === 'any', 'a raw 32-hex code can still be pasted')
assert(parseInviteInput('https://syncup-time.com/i/7k2mq9p')?.code === '7K2MQ9P', 'short links use /i/<code>')
assert(parseInviteInput('https://syncup-time.com/7K2MQ9P')?.code === '7K2MQ9P', 'a bare short path also joins')
assert(shortCodeFromPath('/dev/results') === null, 'the results preview path is not an invite')
assert(shortCodeFromPath('/i/7K2MQ9P/') === '7K2MQ9P', 'the short path ignores a trailing slash')
assert(parseInviteInput('https://syncup-time.com/logo.png') === null, 'static files are not invite codes')

const shortMigration = readFileSync(new URL('../supabase/migrations/20261113190000_short_invite_codes.sql', import.meta.url), 'utf8')
const migrationBody = shortMigration.replace(/\$\$[\s\S]*?\$\$/g, '')
assert(shortMigration.includes('hupaak_group_invites'), 'group invites have their own table')
assert(shortMigration.includes('add column short_code text'), 'short codes are a new column')
assert(!/\bdrop\s+table\b/i.test(shortMigration), 'the short-code migration does not drop a table')
assert(!/\btruncate\b/i.test(shortMigration), 'the short-code migration does not truncate')
assert(!/\bdelete\s+from\b/i.test(migrationBody), 'applying the migration does not delete rows')
assert(!/update\s+public\.hupaak_(campaigns|people|blocks|admins|access|groups|group_members)\b/i.test(migrationBody), 'applying the migration does not rewrite events or people')
assert(!/set\s+code\s*=/i.test(migrationBody), 'applying the migration does not rotate existing long codes')

const deleteMigration = readFileSync(new URL('../supabase/migrations/20261114120000_admins_delete_campaign.sql', import.meta.url), 'utf8')
const deleteBody = deleteMigration.replace(/--.*$/gm, '')
assert(deleteMigration.includes('hupaak_campaigns_delete'), 'the new migration names the delete policy')
assert(deleteMigration.includes('hupaak_private.can_edit_campaign(id)'), 'admins who can edit may delete')
assert(!deleteMigration.includes('is_campaign_choreographer'), 'choreographers are not granted delete')
assert(!/hupaak_campaigns_(select|insert|update)\b/.test(deleteMigration), 'the migration does not rewrite other campaign policies')
assert(!/\bdrop\s+table\b/i.test(deleteMigration), 'the delete migration does not drop a table')
assert(!/\bdelete\s+from\b/i.test(deleteBody), 'the delete migration does not delete rows')
assert(!/\bupdate\s+public\./i.test(deleteBody), 'the delete migration does not rewrite event rows')
assert(/deleteCampaign[\s\S]*\.select\('id'\)[\s\S]*delete_blocked/.test(dbSource), 'a delete that removes no row is an error')
assert(appSource.includes("raw === 'delete_blocked'") && appSource.includes("t(lang, 'delete_failed')"), 'a blocked delete is shown to the user')
assert(!setupUi.includes('max-w-md'), 'the setup calendar is not locked to a narrow column')
assert(!setupUi.includes('border-t border-current/10'), 'setup sections do not use hairline rules')

const pairGroups = [
  { id: 'a', memberIds: ['ada', 'bea'] },
  { id: 'b', memberIds: ['bea'] },
]
assert(membershipChanges(pairGroups, 'ada', 'a', 'b').map((change) => `${change.groupId}:${change.included}`).join() === 'b:true,a:false', 'moving a dancer adds the new group before leaving the old one')
assert(membershipChanges(pairGroups, 'bea', 'a', 'b').map((change) => change.groupId).join() === 'a', 'moving onto a group they already belong to only leaves the source')
assert(membershipChanges(pairGroups, 'ada', 'a', null).every((change) => change.groupId === 'a' && !change.included), 'dropping on all participants leaves that group only')
assert(membershipChanges(pairGroups, 'cy', null, 'b').map((change) => `${change.groupId}:${change.included}`).join() === 'b:true', 'an ungrouped dancer joins the chosen group')
assert(membershipChanges(pairGroups, 'ada', 'a', 'a').length === 0, 'dropping onto the current group writes nothing')
assert(membershipChanges(pairGroups, 'cy', null, null).length === 0, 'an ungrouped dancer dropped on all participants writes nothing')
assert(!membershipChanges(pairGroups, 'ada', 'a', 'b').some((change) => change.groupId === 'b' && !change.included), 'a move does not remove the destination group')

const roleGroups = [{ id: 'main', memberIds: ['ada'] }]
const grantedOrganizer = grantRole({
  person: { id: 'ada', role: 'dancer', email: 'ada@example.com' },
  groups: roleGroups,
  admins: [],
  grant: 'organizer',
})
assert(grantedOrganizer.person.role === 'dancer' && grantedOrganizer.person.isOrganizer, 'an organizer grant keeps participant status')
assert(grantedOrganizer.groups[0]?.memberIds.join() === 'ada', 'an organizer grant keeps the group')
assert(roleGroups[0]?.memberIds.join() === 'ada', 'granting a role does not rewrite the original groups')
const grantedAdmin = grantRole({
  person: { id: 'ada', role: 'dancer', isOrganizer: true, email: 'ada@example.com' },
  groups: grantedOrganizer.groups,
  admins: grantedOrganizer.admins,
  grant: 'admin',
})
assert(grantedAdmin.person.role === 'dancer' && grantedAdmin.person.isOrganizer, 'an admin grant keeps participant and organizer status')
assert(grantedAdmin.groups[0]?.memberIds.join() === 'ada', 'an admin grant keeps the group')
assert(grantedAdmin.admins.map((admin) => admin.email).join() === 'ada@example.com', 'an admin grant records the email')

const paintDay = '2026-11-12'
const painted = paintBlocks([], [{ iso: paintDay, startHour: 10, endHour: 12, kind: 'unavailable' }], 9, 22)
assert(painted.length === 1 && painted[0]?.kind === 'unavailable', 'a drag paints one NA block')
const otherDay = {
  id: 'keep',
  kind: 'available' as const,
  start: setTime(parseISODate('2026-11-13'), 10),
  end: setTime(parseISODate('2026-11-13'), 12),
  wholeDay: false,
}
const replaced = paintBlocks([otherDay, ...painted], [{ iso: paintDay, startHour: 11, endHour: 12, kind: 'available' }], 9, 22)
const sameDay = replaced.filter((block) => toISODateString(block.start) === paintDay)
assert(replaced.some((block) => block.id === 'keep'), 'painting one person does not rewrite another day')
assert(sameDay.some((block) => block.kind === 'unavailable' && block.start.getHours() === 10), 'NA before the new OK stays')
assert(sameDay.some((block) => block.kind === 'available' && block.start.getHours() === 11), 'OK replaces only the painted slice')
const dragSpans = spansFromDrag(
  { iso: paintDay, index: 2, header: false },
  { iso: '2026-11-13', index: 4, header: false },
  [paintDay, '2026-11-13'],
  9,
  22,
  'available',
)
assert(dragSpans.length === 2 && dragSpans.every((span) => span.startHour === 10 && span.endHour === 11.5), 'a drag across dates paints the same hours on each day')
const headerSpans = spansFromDrag(
  { iso: paintDay, index: 0, header: true },
  { iso: paintDay, index: 0, header: true },
  [paintDay],
  9,
  12,
  'unavailable',
)
assert(headerSpans[0]?.startHour === 9 && headerSpans[0]?.endHour === 12, 'dragging a date paints that whole day')

const viewerCampaign = {
  id: 'event',
  ownerId: 'owner',
  name: 'Demo',
  remarks: '',
  config,
  expiryDate: day,
  onDays: [],
  compulsoryDays: [],
  savedSlots: ['secret'],
  createdAt: day,
  adminCode: null,
  adminShort: null,
  organizerCode: null,
  organizerShort: null,
  participantCode: null,
  participantShort: null,
  admins: [] as { id: string; userId: string | null; email: string }[],
  choreographers: [] as { id: string; userId: string | null; name: string; email: string; role: 'choreographer'; blocks: []; lastUpdated: null }[],
  dancers: [
    { id: 'ada', userId: 'ada', name: 'Ada', email: 'ada@example.com', role: 'dancer' as const, blocks: [], lastUpdated: null },
  ],
  groups: [],
}
assert(!canSeeResults(viewerCampaign, 'ada', 'ada@example.com'), 'a participant cannot see results')
assert(canSeeResults(viewerCampaign, 'owner', 'owner@example.com'), 'the owner can see results')
assert(
  canSeeResults(
    { ...viewerCampaign, dancers: [{ ...viewerCampaign.dancers[0], isOrganizer: true }] },
    'ada',
    'ada@example.com',
  ),
  'a participant who is also an organizer can see results',
)
assert(
  canSeeResults(
    { ...viewerCampaign, admins: [{ id: 'ad', userId: 'ada', email: 'ada@example.com' }] },
    'ada',
    'ada@example.com',
  ),
  'an admin can see results',
)
const organizerViewer = { ...viewerCampaign, dancers: [{ ...viewerCampaign.dancers[0], isOrganizer: true }] }
assert(canEditEvent(organizerViewer, 'ada', 'ada@example.com'), 'an organizer can edit event settings')
assert(canEditEvent(viewerCampaign, 'owner', 'owner@example.com'), 'the owner can edit event settings')
assert(!canEditEvent(viewerCampaign, 'ada', 'ada@example.com'), 'a participant cannot edit event settings')
assert(emailForAdminGrant('ada@example.com', null) === 'ada@example.com', 'an admin grant keeps an existing email')
assert(emailForAdminGrant('', 'Ada@Example.com') === 'ada@example.com', 'an admin grant can take a prompted email')
assert(emailForAdminGrant('', null) === null, 'cancelling the email prompt does not grant admin')
assert(emailForAdminGrant('ada@example.com', 'other@example.com') === 'ada@example.com', 'a prompted email does not replace one already stored')

const privacyMigration = readFileSync(new URL('../supabase/migrations/20261114180000_role_grants_and_results_privacy.sql', import.meta.url), 'utf8')
assert(privacyMigration.includes('is_organizer'), 'organizer grants are an added column')
assert(privacyMigration.includes('can_read_blocks'), 'availability reads are tightened')
assert(privacyMigration.includes('hupaak_my_saved_slots'), 'shortlist slots move behind a roster check')
assert(privacyMigration.includes('revoke select (saved_slots)'), 'participants cannot select saved slots')
assert(privacyMigration.includes('p.user_id = (select hupaak_private.current_user_id())'), 'organizer checks keep the live text user id')
assert(!privacyMigration.includes('auth.uid()'), 'the privacy migration does not switch identity checks to auth.uid()')
assert(!/policy hupaak_campaigns_delete/i.test(privacyMigration), 'the privacy migration does not touch admin delete')
assert(!/\bdrop\s+table\b/i.test(privacyMigration), 'the privacy migration does not drop a table')
assert(!/\btruncate\b/i.test(privacyMigration), 'the privacy migration does not truncate')
assert(!/\bdelete\s+from\b/i.test(privacyMigration), 'the privacy migration does not delete rows')
assert(!/update\s+public\.hupaak_/i.test(privacyMigration), 'the privacy migration does not rewrite existing rows')

const portalMigration = readFileSync(new URL('../supabase/migrations/20261114210000_organizer_portal_parity.sql', import.meta.url), 'utf8')
assert(portalMigration.includes('protect_campaign_update'), 'organizers can save event settings')
assert(portalMigration.includes('can_edit_roster'), 'portal reads use the roster check organizers already pass')
assert(!/policy hupaak_campaigns_delete/i.test(portalMigration), 'event delete stays on the existing policy')
assert(!portalMigration.includes('rotate_hupaak'), 'the portal migration does not change invite issuance')
assert(!portalMigration.includes('claim_hupaak'), 'the portal migration does not change invite claims')
assert(!/\bdrop\s+table\b/i.test(portalMigration), 'the portal migration does not drop a table')
assert(!/\btruncate\b/i.test(portalMigration), 'the portal migration does not truncate')
assert(!/\bdelete\s+from\b/i.test(portalMigration), 'the portal migration does not delete rows')
assert(!/update\s+public\.hupaak_/i.test(portalMigration), 'the portal migration does not rewrite existing rows')

const palette = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
assert(palette.includes('--logo-sage: #92ba8c'), 'sage comes from the logo')
assert(palette.includes('--logo-gold: #f5ce7b'), 'gold comes from the logo')
assert(palette.includes('--logo-pink: #f19ba8'), 'pink comes from the logo')
assert(palette.includes('--logo-purple: #7c7bba'), 'purple comes from the logo')
const buttons = readFileSync(new URL('../src/lib/ui.ts', import.meta.url), 'utf8')
assert(buttons.includes('btn-primary') && !/bg-blue-|bg-\[#0|007aff|2563eb/i.test(buttons), 'primary buttons use the logo token, not a lone blue')

console.log('schedule checks passed')
