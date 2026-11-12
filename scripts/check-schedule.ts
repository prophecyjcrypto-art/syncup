import { getDaysArray, groupByMonth, parseISODate, setTime, toISODateString } from '../src/lib/dates.ts'
import { availabilityHeatmap, calculateBestSlots, coveredMs, freeIntervals, normalizeDurationHours, uncoveredDays } from '../src/lib/schedule.ts'
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
assert(covered === 2 * 60 * 60 * 1000, 'Avail minus overlapping NA should leave 2 hours')

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

console.log('schedule checks passed')
