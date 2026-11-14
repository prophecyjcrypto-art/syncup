import { StrictMode, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AvailabilityEditor } from '../components/AvailabilityEditor'
import { CampaignList } from '../components/CampaignList'
import { DancerPortal } from '../components/DancerPortal'
import { FlowSteps } from '../components/Guide'
import { Landing } from '../components/Landing'
import { ResultsPanel } from '../components/ResultsPanel'
import { RosterPanel } from '../components/RosterPanel'
import { OrganizerPortal, type HubTab } from '../components/OrganizerPortal'
import { SetupPanel } from '../components/SetupPanel'
import { CalendarProvider } from '../lib/calendarContext'
import { parseISODate, setTime } from '../lib/dates'
import { textMuted, textPrimary } from '../lib/ui'
import type { BlockKind, Campaign, Language, TimeBlock } from '../types'

const previewParams = new URLSearchParams(window.location.search)
const lang: Language = previewParams.get('lang') === 'en' ? 'en' : 'zh'
const previewDetail = previewParams.get('detail') === '1'

const previewDays = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']

function span(iso: string, start: number, end: number, kind: BlockKind): TimeBlock {
  const day = parseISODate(iso)
  return {
    id: `${iso}-${kind}-${start}-${end}`,
    kind,
    start: setTime(day, start),
    end: setTime(day, end),
    wholeDay: false,
  }
}

function eachDay(start: number, end: number, kind: BlockKind): TimeBlock[] {
  return previewDays.map((iso) => span(iso, start, end, kind))
}

const campaign: Campaign = {
  id: 'demo',
  ownerId: 'owner',
  name: 'Demo',
  remarks: '',
  config: {
    startDate: '2026-11-12',
    endDate: '2026-11-18',
    durationHours: null,
    dayStartHour: 9,
    dayEndHour: 22,
    attendanceTolerance: 0,
  },
  expiryDate: '2026-12-31T23:59:59.000Z',
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
  groups: [
    { id: 'g-a', name: 'A組', memberIds: ['dancer-jie', 'dancer-min'], inviteCode: '2K7MQ9H' },
    { id: 'g-b', name: 'B組', memberIds: ['dancer-ren'], inviteCode: '8NP4KWT' },
  ],
  choreographers: [
    {
      id: 'org-1',
      userId: null,
      name: '主辦',
      email: 'host@example.com',
      role: 'choreographer',
      blocks: [],
      lastUpdated: null,
    },
  ],
  dancers: [
    {
      id: 'dancer-jie',
      userId: null,
      name: '小杰',
      email: 'jie@example.com',
      role: 'dancer',
      blocks: eachDay(18, 22, 'unavailable'),
      lastUpdated: null,
    },
    {
      id: 'dancer-min',
      userId: null,
      name: '阿敏',
      email: 'min@example.com',
      role: 'dancer',
      blocks: eachDay(9, 12, 'unavailable'),
      lastUpdated: null,
    },
    {
      id: 'dancer-ren',
      userId: null,
      name: '阿仁',
      email: 'ren@example.com',
      role: 'dancer',
      blocks: eachDay(9, 13, 'available'),
      lastUpdated: null,
    },
    {
      id: 'dancer-su',
      userId: null,
      name: '小蘇',
      email: 'su@example.com',
      role: 'dancer',
      blocks: [],
      lastUpdated: null,
    },
  ],
}

function Shell({ children, flow }: { children: ReactNode; flow?: boolean }) {
  return (
    <div className="theme-dark min-h-dvh" data-preview="">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-32 top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[#7c7bb9] opacity-40 blur-3xl" />
      </div>
      <div className="relative z-10">
        <header className="glass-bar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
              <span className="min-w-0">
                <span className={`block truncate text-[15px] font-semibold ${textPrimary(true)}`}>SyncUp</span>
                <span className={`block truncate text-xs ${textMuted(true)}`}>Demo</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="glass-well flex h-11 w-11 items-center justify-center rounded-full" aria-label="settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
              <button type="button" className={`min-h-11 rounded-full px-3 text-sm ${textMuted(true)}`}>
                {lang === 'zh' ? '登出' : 'Sign out'}
              </button>
            </div>
          </div>
          {flow && (
            <div className="mx-auto max-w-6xl px-3 pb-1 sm:px-6">
              <FlowSteps
                lang={lang}
                current="results"
                enabled={{ setup: true, choreographers: true, dancers: true, results: true }}
                onJump={() => undefined}
              />
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}

function LivePreview({ name }: { name: string }) {
  const tab: HubTab = name === 'hub-settings' ? 'event' : 'participants'
  const [event, setEvent] = useState(campaign)
  if (name === 'setup-event') {
    return (
      <Shell>
        <SetupPanel
          lang={lang}
          isDarkMode
          initial={event}
          readOnly={false}
          onCancel={() => undefined}
          onConfirm={() => undefined}
          onCopy={() => undefined}
          onCreateGroup={(groupName) =>
            setEvent((current) => ({
              ...current,
              groups: [...current.groups, { id: `g-${groupName}`, name: groupName, memberIds: [], inviteCode: '3H7K2NP' }],
            }))
          }
          onRenameGroup={(groupId, next) =>
            setEvent((current) => ({
              ...current,
              groups: current.groups.map((group) => (group.id === groupId ? { ...group, name: next } : group)),
            }))
          }
          onDeleteGroup={(groupId) =>
            setEvent((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== groupId) }))
          }
        />
      </Shell>
    )
  }
  return (
    <Shell>
      <OrganizerPortal
        lang={lang}
        isDarkMode
        campaign={event}
        canEditEvent
        initialTab={tab}
        onBack={() => undefined}
        onCopy={() => undefined}
        onSave={() => undefined}
        onCreateGroup={(groupName) =>
          setEvent((current) => ({
            ...current,
            groups: [...current.groups, { id: `g-${groupName}`, name: groupName, memberIds: [], inviteCode: '3H7K2NP' }],
          }))
        }
        onRenameGroup={(groupId, next) =>
          setEvent((current) => ({
            ...current,
            groups: current.groups.map((group) => (group.id === groupId ? { ...group, name: next } : group)),
          }))
        }
        onDeleteGroup={(groupId) =>
          setEvent((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== groupId) }))
        }
        onToggleMember={(groupId, personId, included) =>
          setEvent((current) => ({
            ...current,
            groups: current.groups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    memberIds: included ? [...group.memberIds, personId] : group.memberIds.filter((id) => id !== personId),
                  }
                : group,
            ),
          }))
        }
        onGrantRole={(personId, role) =>
          setEvent((current) => {
            const person = [...current.dancers, ...current.choreographers].find((item) => item.id === personId)
            if (!person) return current
            if (role === 'organizer') {
              return {
                ...current,
                dancers: current.dancers.map((item) => (item.id === personId ? { ...item, isOrganizer: true } : item)),
                choreographers: current.choreographers.map((item) => (item.id === personId ? { ...item, isOrganizer: true } : item)),
              }
            }
            if (!person.email.includes('@')) return current
            if (current.admins.some((admin) => admin.email.toLowerCase() === person.email.toLowerCase())) return current
            return {
              ...current,
              admins: [...current.admins, { id: `admin-${personId}`, userId: person.userId, email: person.email.toLowerCase() }],
            }
          })
        }
      />
    </Shell>
  )
}

function Preview({ name }: { name: string }) {
  if (name === 'login') {
    return (
      <div className="theme-dark min-h-dvh" data-preview="">
        <header className="glass-bar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3">
            <span className={`text-[15px] font-semibold ${textPrimary(true)}`}>SyncUp</span>
            <div className="flex items-center gap-1">
              <button type="button" className="min-h-11 rounded-full px-3 text-sm font-medium">
                {lang === 'zh' ? '登入' : 'Sign in'}
              </button>
              <button type="button" className="glass-well flex h-11 w-11 items-center justify-center rounded-full" aria-label="settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6">
          <Landing
            lang={lang}
            isDarkMode
            mode="signin"
            email=""
            password=""
            busy={false}
            note=""
            onMode={() => undefined}
            onEmail={() => undefined}
            onPassword={() => undefined}
            onSubmit={(event) => event.preventDefault()}
            onGoogle={() => undefined}
            onFocusAuth={() => undefined}
          />
        </main>
      </div>
    )
  }
  if (name === 'setup' || name === 'setup-duration') {
    const timed = name === 'setup-duration' ? { ...campaign, config: { ...campaign.config, durationHours: 1.5 } } : undefined
    return (
      <Shell>
        <SetupPanel
          lang={lang}
          isDarkMode
          initial={timed}
          readOnly={false}
          onCancel={() => undefined}
          onConfirm={() => undefined}
          onCopy={() => undefined}
        />
      </Shell>
    )
  }
  if (name === 'events') {
    return (
      <Shell>
        <CampaignList
          lang={lang}
          isDarkMode
          campaigns={[
            {
              ...campaign,
              ownerId: 'user_legacy_owner',
              admins: [{ id: 'admin-cj', userId: 'admin-cj', email: 'admin@example.com' }],
            },
          ]}
          userId={previewParams.get('as') === 'member' ? 'guest' : 'admin-cj'}
          email={previewParams.get('as') === 'member' ? 'guest@example.com' : 'admin@example.com'}
          onCreate={() => undefined}
          onDelete={() => undefined}
          onResults={() => undefined}
          onPortal={() => undefined}
          onHub={() => undefined}
          onCopy={() => undefined}
          onJoinAdmin={() => undefined}
          initialOpenId={previewDetail ? campaign.id : null}
        />
      </Shell>
    )
  }
  if (name === 'roster' || name === 'members') {
    return (
      <Shell flow>
        <RosterPanel
          lang={lang}
          isDarkMode
          campaign={name === 'members' ? { ...campaign, dancers: [] } : campaign}
          variant={name === 'members' ? 'dancer' : 'choreographer'}
          onBack={() => undefined}
          onNext={() => undefined}
          onSave={async () => true}
          onDelete={async () => undefined}
          onCreateGroup={name === 'members' ? async () => true : undefined}
          onRenameGroup={name === 'members' ? async () => true : undefined}
          onDeleteGroup={name === 'members' ? async () => true : undefined}
          onToggleMember={name === 'members' ? async () => true : undefined}
        />
      </Shell>
    )
  }
  if (name === 'hub' || name === 'hub-stats' || name === 'hub-settings' || name === 'setup-event') {
    return <LivePreview name={name} />
  }
  if (name === 'portal') {
    return (
      <Shell>
        <DancerPortal
          lang={lang}
          isDarkMode
          campaign={campaign}
          userId="guest"
          email="guest@example.com"
          linkRole="dancer"
          onBack={() => undefined}
          onSave={async () => true}
        />
      </Shell>
    )
  }
  if (name === 'slot') {
    const iso = '2026-12-08'
    const start = setTime(parseISODate(iso), 10)
    const chelseaEnd = setTime(parseISODate(iso), 15)
    const sessionEnd = setTime(parseISODate(iso), 16.5)
    const mark = (id: string, from: Date, to: Date): TimeBlock => ({
      id,
      kind: 'unavailable',
      start: from,
      end: to,
      wholeDay: false,
    })
    const dancer = (id: string, personName: string, blocks: TimeBlock[]) => ({
      id,
      userId: null,
      name: personName,
      email: '',
      role: 'dancer' as const,
      blocks,
      lastUpdated: null,
    })
    const rehearsal: Campaign = {
      ...campaign,
      name: 'Tuesday rehearsal',
      config: {
        ...campaign.config,
        startDate: iso,
        endDate: iso,
        durationHours: 6.5,
        dayStartHour: 10,
        dayEndHour: 17,
        attendanceTolerance: 0,
      },
      onDays: [iso],
      compulsoryDays: [],
      savedSlots: [start.toISOString()],
      choreographers: [],
      groups: [],
      dancers: [
        dancer('chelsea', 'Chelsea', [mark('chelsea-na', chelseaEnd, sessionEnd)]),
        dancer('wing', 'Wing', []),
        dancer('lok', 'Lok', []),
        dancer('hoi', 'Hoi', []),
        dancer('ren', 'Ren', [mark('ren-na', start, sessionEnd)]),
      ],
    }
    return (
      <CalendarProvider value={{ token: null, note: '', setNote: () => undefined, connect: () => undefined, disconnect: () => undefined }}>
        <Shell>
          <ResultsPanel
            lang={lang}
            isDarkMode
            campaign={rehearsal}
            onBack={() => undefined}
            onSaveSlots={() => undefined}
            canPin
            canSetDuration
            onSaveDuration={() => undefined}
          />
        </Shell>
      </CalendarProvider>
    )
  }
  if (name === 'availability') {
    return <AvailabilityPreview />
  }
  return (
    <CalendarProvider value={{ token: null, note: '', setNote: () => undefined, connect: () => undefined, disconnect: () => undefined }}>
      <Shell flow>
        <ResultsPanel
          lang={lang}
          isDarkMode
          campaign={campaign}
          onBack={() => undefined}
          onSaveSlots={() => undefined}
          canPin
          canSetDuration
          onSaveDuration={() => undefined}
        />
      </Shell>
    </CalendarProvider>
  )
}

function AvailabilityPreview() {
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  return (
    <Shell>
      <AvailabilityEditor
        lang={lang}
        isDarkMode
        config={campaign.config}
        onDays={campaign.onDays}
        compulsoryDays={campaign.compulsoryDays}
        blocks={blocks}
        onChange={setBlocks}
      />
    </Shell>
  )
}

export function mountFixture(name: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Preview name={name} />
    </StrictMode>,
  )
}
