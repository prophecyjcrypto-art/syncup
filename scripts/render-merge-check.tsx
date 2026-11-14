import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvailabilityEditor } from '../src/components/AvailabilityEditor.tsx'
import { CampaignList } from '../src/components/CampaignList.tsx'
import { ResultsPanel } from '../src/components/ResultsPanel.tsx'
import { OrganizerPortal } from '../src/components/OrganizerPortal.tsx'
import { SetupPanel } from '../src/components/SetupPanel.tsx'
import { CalendarProvider } from '../src/lib/calendarContext.tsx'
import { GOOGLE_CALENDAR_ENABLED } from '../src/lib/googleCalendar.ts'
import type { Campaign, TimeBlock } from '../src/types.ts'

const memory = new Map<string, string>()
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value)
  },
  removeItem: (key: string) => {
    memory.delete(key)
  },
}
Object.assign(globalThis, {
  window: {
    location: new URL('https://syncup-time.com/'),
    sessionStorage: storage,
    localStorage: storage,
    dispatchEvent: () => true,
    history: { replaceState: () => undefined },
  },
  sessionStorage: storage,
  localStorage: storage,
})

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const config = {
  startDate: '2026-11-12',
  endDate: '2026-11-12',
  durationHours: null as number | null,
  dayStartHour: 9,
  dayEndHour: 12,
  attendanceTolerance: 0,
}

const dancer = {
  id: 'd1',
  userId: 'user-dancer',
  name: 'Ava',
  email: 'ava@example.com',
  role: 'dancer' as const,
  blocks: [] as TimeBlock[],
  lastUpdated: null,
}

const campaign: Campaign = {
  id: 'event-1',
  ownerId: 'owner-1',
  name: 'Thursday rehearsal',
  remarks: '',
  config,
  expiryDate: '2026-12-01',
  onDays: [],
  compulsoryDays: [],
  savedSlots: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  adminCode: 'a'.repeat(32),
  adminShort: '4H8K2MQ',
  organizerCode: 'b'.repeat(32),
  organizerShort: '7K2MQ9P',
  participantCode: 'c'.repeat(32),
  participantShort: '9RWT3MD',
  admins: [],
  choreographers: [],
  dancers: [dancer],
  groups: [],
}

const calendar = {
  token: 'should-stay-hidden',
  note: '',
  connect: () => undefined,
  disconnect: () => undefined,
  setNote: () => undefined,
}

function withCalendar(node: ReactNode) {
  return createElement(CalendarProvider, { value: calendar, children: node })
}

const setup = renderToStaticMarkup(
  createElement(SetupPanel, {
    lang: 'en',
    isDarkMode: true,
    readOnly: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }),
)
assert(setup.includes('Duration (Optional)'), 'new events mark duration optional')
assert(setup.includes('Not set yet'), 'new events start with no duration')
assert(setup.includes('Invite codes appear here after you create the event.'), 'invite codes are part of create')
assert(setup.includes('All participants') && setup.indexOf('All participants') < setup.indexOf('Groups'), 'create form lists all participants before groups')
assert(!setup.includes('Connect Google Calendar'), 'setup does not offer Google Calendar')

const setupZh = renderToStaticMarkup(
  createElement(SetupPanel, {
    lang: 'zh',
    isDarkMode: false,
    readOnly: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }),
)
assert(setupZh.includes('時長 (選填)'), 'Chinese create form marks duration optional')
assert(setupZh.includes('全體參加者') && setupZh.indexOf('全體參加者') < setupZh.indexOf('組別'), 'Chinese create form lists everyone before groups')

const existing = renderToStaticMarkup(
  withCalendar(
    createElement(SetupPanel, {
      lang: 'en',
      isDarkMode: true,
      initial: { ...campaign, config: { ...config, durationHours: 3 } },
      readOnly: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onCopy: () => undefined,
    }),
  ),
)
assert(existing.includes('Participants'), 'participants head the codes')
assert(existing.includes('All participants'), 'the event code is labeled for everyone')
assert(!existing.includes('text-[1.65rem]'), 'invite codes are not poster-sized')
assert((existing.match(/data-codes-section/g) ?? []).length === 1, 'codes stay in one card')
const participantsBlock = existing.slice(existing.indexOf('data-participants-block'), existing.indexOf('data-organizer-block'))
assert(participantsBlock.includes('All participants') && participantsBlock.includes('Groups') && participantsBlock.includes('9RWT3MD'), 'all participants and groups stay together')
assert(!participantsBlock.includes('7K2MQ9P') && !participantsBlock.includes('4H8K2MQ'), 'organizer and admin codes stay outside participants')
assert(existing.indexOf('data-organizer-block') < existing.indexOf('data-admins-block'), 'organizer stays its own block ahead of admins')
assert(existing.includes('7K2MQ9P'), 'organizer invite shows the short code')
assert(existing.includes('9RWT3MD'), 'participant invite shows the short code')
assert(existing.includes('4H8K2MQ'), 'admin invite shows the short code')
assert(!existing.includes('organizer=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'the editor copies a code instead of showing the long organizer url')
assert(existing.includes('Not set yet'), 'a saved duration can still be cleared')
assert(existing.includes('>1 hour</option>'), 'one hour stays singular')
assert(!existing.includes('>1 hours</option>'), 'one hour is not plural')
assert(existing.includes('>1.5 hours</option>'), 'other lengths stay plural')
assert(existing.includes('>0 hours</option>'), 'a zero buffer stays plural')
assert(!existing.includes('New code'), 'the editor does not offer a new invite code')
const sectionOrder = ['data-setup-section="timing"', 'data-setup-section="days"', 'data-setup-section="people"', 'data-setup-section="notes"']
let sectionAt = -1
for (const marker of sectionOrder) {
  const at = existing.indexOf(marker)
  assert(at > sectionAt, `edit page section out of order: ${marker}`)
  sectionAt = at
}
const timing = existing.slice(existing.indexOf('data-setup-section="timing"'), existing.indexOf('data-setup-section="days"'))
const lengthPair = timing.slice(timing.indexOf('data-timing-length'), timing.indexOf('data-setup-deadline'))
assert(lengthPair.includes('Duration') && lengthPair.indexOf('Duration') < lengthPair.indexOf('Late / early buffer'), 'buffer sits with duration')
assert(timing.indexOf('data-setup-deadline') > timing.indexOf('data-timing-length'), 'the deadline stays in the timing section')

const hub = renderToStaticMarkup(
  createElement(OrganizerPortal, {
    lang: 'en',
    isDarkMode: true,
    campaign: {
      ...campaign,
      groups: [{ id: 'g1', name: 'Main', memberIds: ['d1'], inviteCode: '2K7MQ9H' }],
    },
    canEditEvent: true,
    canRotateEvent: true,
    onBack: () => undefined,
    onSchedule: () => undefined,
    onCopy: () => undefined,
    onSave: () => undefined,
    onCreateGroup: () => undefined,
    onRenameGroup: () => undefined,
    onDeleteGroup: () => undefined,
    onToggleMember: () => {
      throw new Error('opening the hub assigned a dancer')
    },
  }),
)
const hubParticipants = hub.slice(hub.indexOf('data-participants-block'), hub.indexOf('data-organizer-block'))
assert(hubParticipants.includes('All participants') && hubParticipants.indexOf('All participants') < hubParticipants.indexOf('Groups'), 'hub lists all participants before groups')
assert(hubParticipants.includes('2K7MQ9H') && hubParticipants.includes('data-person-id="d1"'), 'a group shows its code and its dancers')
assert(!hub.slice(hub.indexOf('data-drop-group="all"'), hub.indexOf('data-drop-group="g1"')).includes('d1'), 'grouped dancers stay out of all participants')
assert(!hubParticipants.includes('7K2MQ9P'), 'the hub keeps the organizer code outside participants')
assert(hub.includes('data-assign-tray'), 'dancers can be assigned from the hub')
assert(!hub.includes('New code'), 'the hub does not offer a new invite code')
assert(hub.includes('Copy code') && hub.includes('Copy link'), 'the hub still copies a code or its link')

const results = renderToStaticMarkup(
  withCalendar(
    createElement(ResultsPanel, {
      lang: 'en',
      isDarkMode: true,
      campaign,
      onBack: () => undefined,
      onSaveSlots: () => undefined,
      canPin: true,
      canSetDuration: true,
      onSaveDuration: () => undefined,
    }),
  ),
)
assert(results.includes('Dancer overlap'), 'results show the half-hour overlap heatmap')
assert(results.includes('1 of 1 free'), 'heatmap cells count free dancers')
assert(!/<select\b/.test(results), 'results length is a stepper, not a dropdown')
const ownerUp = results.match(/<button\b[^>]*data-duration-step="up"[^>]*>/)
const ownerDown = results.match(/<button\b[^>]*data-duration-step="down"[^>]*>/)
assert(ownerUp != null && ownerDown != null, 'results include the hours stepper')
assert(!/\sdisabled=/.test(ownerUp[0]), 'owners can lengthen the session')
assert(/\sdisabled=/.test(ownerDown[0]), 'the stepper cannot go below the minimum before a length is chosen')
assert(!results.includes('Connect Google Calendar'), 'results hide Google Calendar while the flag is off')
assert(!results.includes('Save to Google Calendar'), 'results hide save-to-calendar while the flag is off')
assert(results.includes('Export calendar'), 'ICS export stays available')

const memberResults = renderToStaticMarkup(
  withCalendar(
    createElement(ResultsPanel, {
      lang: 'zh',
      isDarkMode: false,
      campaign,
      onBack: () => undefined,
      onSaveSlots: () => undefined,
      canPin: false,
      canSetDuration: false,
      onSaveDuration: () => undefined,
    }),
  ),
)
assert(memberResults.includes('參加者重疊'), 'members still see the overlap heatmap')
assert(!/<select\b/.test(memberResults), 'members do not get a length dropdown')
const memberSteps = memberResults.match(/<button\b[^>]*data-duration-step="(?:up|down)"[^>]*>/g) ?? []
assert(memberSteps.length === 2 && memberSteps.every((button) => /\sdisabled=/.test(button)), 'members cannot change the shared duration')
assert(memberResults.includes('disabled=""'), 'members cannot pin the shortlist')
assert(!memberResults.includes('用這個時段'), 'members do not get the shortlist button')

const list = renderToStaticMarkup(
  createElement(CampaignList, {
    lang: 'en',
    isDarkMode: true,
    campaigns: [campaign],
    userId: 'user-dancer',
    email: 'ava@example.com',
    onCreate: () => undefined,
    onOpen: () => undefined,
    onDelete: () => undefined,
    onChoreographers: () => undefined,
    onDancers: () => undefined,
    onResults: () => undefined,
    onPortal: () => undefined,
    onCopy: () => undefined,
    onJoinAdmin: () => undefined,
    onHub: () => undefined,
  }),
)
assert(list.includes('View results'), 'a member can open results')
assert(list.includes('Enter availability'), 'a member can still enter their own times')
assert(list.includes('1 person'), 'one person is singular')
assert(!list.includes('1 People') && !list.includes('1 people'), 'the card does not say People for one person')
assert(!list.includes('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'a member does not see the organizer invite code')

const ownerList = renderToStaticMarkup(
  createElement(CampaignList, {
    lang: 'en',
    isDarkMode: true,
    campaigns: [{ ...campaign, groups: [{ id: 'g1', name: 'Main', memberIds: [], inviteCode: '2K7MQ9H' }] }],
    userId: 'owner-1',
    email: 'owner@example.com',
    onCreate: () => undefined,
    onOpen: () => undefined,
    onDelete: () => undefined,
    onChoreographers: () => undefined,
    onDancers: () => undefined,
    onResults: () => undefined,
    onPortal: () => undefined,
    onCopy: () => undefined,
    onJoinAdmin: () => undefined,
    onHub: () => undefined,
  }),
)
assert(ownerList.includes('Details'), 'a manager opens a detail view')
assert(ownerList.includes('View results'), 'results stay on the preview card')
assert(!ownerList.includes('9RWT3MD'), 'the preview card hides the participant code')
assert(!ownerList.includes('2K7MQ9H'), 'the preview card hides group codes')
assert(!ownerList.includes('Copy admin link') && !ownerList.includes('Copy invite link'), 'invite actions stay off the card face')
assert(!ownerList.includes('Enter availability'), 'operate actions stay off the manager card')
assert(!ownerList.includes('New code'), 'the card does not rotate codes')

const ownerDetail = renderToStaticMarkup(
  createElement(CampaignList, {
    lang: 'en',
    isDarkMode: true,
    campaigns: [{ ...campaign, groups: [{ id: 'g1', name: 'Main', memberIds: [], inviteCode: '2K7MQ9H' }] }],
    userId: 'owner-1',
    email: 'owner@example.com',
    initialOpenId: 'event-1',
    onCreate: () => undefined,
    onOpen: () => undefined,
    onDelete: () => undefined,
    onChoreographers: () => undefined,
    onDancers: () => undefined,
    onResults: () => undefined,
    onPortal: () => undefined,
    onCopy: () => undefined,
    onJoinAdmin: () => undefined,
    onHub: () => undefined,
  }),
)
assert(ownerDetail.includes('data-card-detail'), 'the detail view is reachable')
assert(ownerDetail.includes('All participants') && ownerDetail.includes('9RWT3MD'), 'the detail shows the event-wide participant code')
assert(ownerDetail.includes('Copy code') && ownerDetail.includes('Organizer link') && ownerDetail.includes('Copy admin link'), 'the detail labels each invite copy')
assert(!ownerDetail.includes('2K7MQ9H'), 'group codes stay out of the card detail')
assert(!ownerDetail.includes('New code'), 'the detail does not rotate codes')

const editor = renderToStaticMarkup(
  withCalendar(
    createElement(AvailabilityEditor, {
      lang: 'en',
      isDarkMode: true,
      config: { ...config, durationHours: 2 },
      onDays: [],
      compulsoryDays: [],
      blocks: [],
      onChange: () => undefined,
    }),
  ),
)
assert(!editor.includes('Connect Google Calendar'), 'availability editor hides Google Calendar')
assert(!editor.includes(calendar.token), 'a stored calendar token is not rendered')
assert(editor.includes('OK'), 'availability entry stays')

assert(GOOGLE_CALENDAR_ENABLED === false, 'the calendar flag stays off')

console.log('merged UI checks passed')
