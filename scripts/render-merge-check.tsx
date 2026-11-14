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
assert(existing.includes('data-setup-calendar') && !existing.includes('max-w-md'), 'the edit calendar uses the content width')
assert(!existing.includes('border-t') && !existing.includes('border-l'), 'edit sections are cards, not hairline rules')
assert(existing.includes('data-info="days"'), 'the calendar info control stays')
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
assert(hub.includes('data-hub-step="event"') && hub.includes('Event'), 'the hub opens event settings')
assert(hub.includes('data-hub-step="organizers"') && hub.includes('Organizers'), 'the hub names the organizer tab')
assert(hub.includes('data-hub-step="participants"') && hub.includes('Participants'), 'the hub names the participant tab')
assert(hub.includes('data-hub-step="results"') && hub.includes('Results'), 'the schedule tab is called Results')
assert(!hub.includes('Schedule'), 'the hub does not call that tab Schedule')
assert(hub.includes('data-hub-tabs') && !hub.includes('data-hub-steps'), 'the hub has one tab bar')
assert(!/step 1 of 4/i.test(hub), 'the hub does not count steps')
for (const id of ['event', 'organizers', 'participants', 'results']) {
  const button = hub.match(new RegExp(`<button\\b[^>]*data-hub-step="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? ''
  assert(button.length > 0, `missing the ${id} tab`)
  assert(!/>\s*[1-4]\s*</.test(button), `the ${id} tab is numbered`)
}
assert(hub.includes('data-drop-role="organizer"') && hub.includes('data-drop-role="admin"'), 'organizer and admin boxes are drop targets')
assert(hub.includes('data-grip'), 'people show a drag grip')
assert(hub.includes('Drop here'), 'empty role boxes say where to drop')
const hubEvent = renderToStaticMarkup(
  createElement(OrganizerPortal, {
    lang: 'en',
    isDarkMode: true,
    campaign,
    canEditEvent: true,
    initialTab: 'event',
    onBack: () => undefined,
    onCopy: () => undefined,
    onSave: () => undefined,
    onCreateGroup: () => undefined,
    onRenameGroup: () => undefined,
    onDeleteGroup: () => undefined,
    onToggleMember: () => undefined,
  }),
)
assert(hubEvent.includes('data-hub-step="event"') && hubEvent.includes('data-setup-section="timing"'), 'event settings live in the hub')
assert(hubEvent.includes('Duration'), 'the hub can edit the event length')
const hubZh = renderToStaticMarkup(
  createElement(OrganizerPortal, {
    lang: 'zh',
    isDarkMode: false,
    campaign,
    canEditEvent: true,
    onBack: () => undefined,
    onCopy: () => undefined,
    onSave: () => undefined,
    onCreateGroup: () => undefined,
    onRenameGroup: () => undefined,
    onDeleteGroup: () => undefined,
    onToggleMember: () => undefined,
  }),
)
assert(hubZh.includes('活動') && hubZh.includes('主辦人') && hubZh.includes('參加者') && hubZh.includes('結果'), 'Chinese hub tabs use 活動、主辦人、參加者、結果')
assert(hubZh.includes('data-hub-step="results"'), 'the Chinese results tab stays on the hub bar')
assert(!hubZh.includes('時間表'), 'the Chinese hub does not call the tab 時間表')
assert(!hubZh.includes('尚未有組別'), 'an event with no groups does not show an empty groups message')
assert(hubZh.includes('新增組別'), 'an event with no groups can start a group')
assert(hubZh.includes('data-person-id="d1"'), 'people stay in all participants when there are no groups')
assert(hubZh.includes('管理參加者'), 'manage participants stays in the participants area')
const hubResults = renderToStaticMarkup(
  withCalendar(
    createElement(OrganizerPortal, {
      lang: 'en',
      isDarkMode: true,
      campaign,
      canEditEvent: true,
      canPin: true,
      canSetDuration: true,
      initialTab: 'results',
      onBack: () => undefined,
      onCopy: () => undefined,
      onSave: () => undefined,
      onCreateGroup: () => undefined,
      onRenameGroup: () => undefined,
      onDeleteGroup: () => undefined,
      onToggleMember: () => undefined,
      onSaveSlots: () => undefined,
      onSaveDuration: () => undefined,
    }),
  ),
)
assert(hubResults.includes('data-hub="results"') && hubResults.includes('data-hub-tabs'), 'results uses the hub tab bar')
assert(hubResults.includes('data-hub-step="participants"') && hubResults.includes('Dancer overlap'), 'results stays under the same tabs')
assert(!hubResults.includes('Connect Google Calendar'), 'the results tab keeps Google Calendar hidden')
assert(!hubResults.includes('data-hub-steps'), 'results does not bring back the numbered steps')

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
assert(!list.includes('View results') && !list.includes('data-results-entry'), 'a participant cannot open results')
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
assert(ownerDetail.includes('Organizer hub'), 'the detail opens the organizer hub by name')
assert(!ownerDetail.includes('Edit event') && !ownerDetail.includes('Enter availability'), 'the detail does not repeat edit or a generic time button')
assert(ownerDetail.includes('Copy code') && ownerDetail.includes('Copy organizer link') && ownerDetail.includes('Copy admin link'), 'the detail labels each invite copy')
assert(ownerDetail.includes('Organizer invite') && ownerDetail.includes('Admin invite'), 'invite headings say who the link is for')
assert(ownerDetail.includes('2K7MQ9H') && ownerDetail.includes('data-invite="group"'), 'each group keeps its code on the detail')
assert(ownerDetail.includes('data-delete-event'), 'an owner can delete from the detail')
assert(!ownerDetail.includes('border-t'), 'detail sections are cards, not hairline rules')
assert(!ownerDetail.includes('New code') && !ownerDetail.includes('Copy invite link'), 'the detail does not rotate codes or reuse a vague invite label')
const detail = ownerDetail.slice(ownerDetail.indexOf('data-card-detail'))
assert(!detail.includes('View results'), 'details does not offer results')
assert(detail.includes('Manage organizers') && detail.includes('data-role-time="organizer"'), 'organizer time and management stay on the organizer card')
assert(detail.includes('Admin time') && detail.includes('data-role-time="admin"'), 'admin time stays on the admin card')
assert(detail.includes('Manage participants') && detail.indexOf('data-invite="participant"') < detail.indexOf('Manage participants'), 'manage participants sits with all participants')
assert(detail.indexOf('Manage participants') < detail.indexOf('data-invite="admin"'), 'manage participants is not inside the admin card')
assert(detail.includes('7K2MQ9P') && detail.includes('4H8K2MQ'), 'organizer and admin cards show their codes')

const adminDetail = renderToStaticMarkup(
  createElement(CampaignList, {
    lang: 'zh',
    isDarkMode: false,
    campaigns: [
      {
        ...campaign,
        ownerId: 'user_legacy_owner',
        admins: [{ id: 'admin-cj', userId: 'admin-cj', email: 'admin@example.com' }],
        groups: [{ id: 'g1', name: 'A組', memberIds: [], inviteCode: '2K7MQ9H' }],
      },
    ],
    userId: 'admin-cj',
    email: 'admin@example.com',
    initialOpenId: 'event-1',
    onCreate: () => undefined,
    onOpen: () => undefined,
    onDelete: () => undefined,
    onResults: () => undefined,
    onPortal: () => undefined,
    onCopy: () => undefined,
    onJoinAdmin: () => undefined,
    onHub: () => undefined,
  }),
)
assert(adminDetail.includes('主辦工作台'), 'Chinese names the organizer hub')
assert(!adminDetail.includes('編輯活動') && !adminDetail.includes('填寫我的時間'), 'Chinese details drops edit and the generic time button')
assert(adminDetail.includes('全體參加者') && adminDetail.includes('複製邀請碼') && adminDetail.includes('複製連結'), 'Chinese participant invites name the code and the link')
assert(adminDetail.includes('主辦人邀請') && adminDetail.includes('複製主辦人連結'), 'the organizer control is an invite link')
assert(adminDetail.includes('管理員邀請') && adminDetail.includes('複製管理員連結'), 'the admin control stays an admin invite link')
assert(adminDetail.includes('2K7MQ9H') && adminDetail.includes('A組'), 'a group card names that group')
assert(adminDetail.includes('data-delete-event') && adminDetail.includes('刪除'), 'an admin who is not the owner can delete')
assert(adminDetail.includes('管理主辦人') && adminDetail.includes('管理參加者'), 'Chinese management labels sit on the matching cards')
assert(adminDetail.includes('主辦人時間') && adminDetail.includes('管理員時間'), 'Chinese time actions name the role')
const adminSheet = adminDetail.slice(adminDetail.indexOf('data-card-detail'))
assert(!adminSheet.includes('>主辦<') && !adminSheet.includes('>主辦人<') && !adminSheet.includes('>管理員<'), 'the sheet does not use the short role names as actions')

const choreographerDetail = renderToStaticMarkup(
  createElement(CampaignList, {
    lang: 'en',
    isDarkMode: true,
    campaigns: [
      {
        ...campaign,
        choreographers: [{ ...dancer, id: 'org-1', userId: 'org-user', role: 'choreographer' }],
      },
    ],
    userId: 'org-user',
    email: 'org@example.com',
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
assert(choreographerDetail.includes('data-card-detail'), 'an organizer can open the detail')
assert(!choreographerDetail.includes('data-delete-event'), 'an organizer who is not an admin cannot delete')
assert(!choreographerDetail.includes('Copy admin link'), 'an organizer does not get the admin invite')

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
assert(editor.includes('data-avail-grid') && editor.includes('data-avail-cell') && editor.includes('09:00'), 'availability uses a results-style time grid')
assert((editor.match(/data-avail-cell/g) ?? []).length > 1, 'the grid has more than one paintable cell')
assert(editor.includes('data-day-label') && editor.includes('data-day="2026-11-12"'), 'dates in the grid can be dragged too')

assert(GOOGLE_CALENDAR_ENABLED === false, 'the calendar flag stays off')
assert(hub.includes('tone-fill-sage') || hub.includes('tone-fill-gold') || hub.includes('tone-fill-purple'), 'accents use the logo palette')
assert(hub.includes('data-accent="gold"') && hub.includes('data-accent="sage"') && hub.includes('data-accent="purple"'), 'hub steps distinguish logo colors')
assert(ownerDetail.includes('role-gold') && ownerDetail.includes('role-sage') && ownerDetail.includes('role-purple'), 'role cards use the logo colors')

console.log('merged UI checks passed')
