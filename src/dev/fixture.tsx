import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AvailabilityEditor } from '../components/AvailabilityEditor'
import { FlowSteps } from '../components/Guide'
import { Landing } from '../components/Landing'
import { ResultsPanel } from '../components/ResultsPanel'
import { SetupPanel } from '../components/SetupPanel'
import { CalendarProvider } from '../lib/calendarContext'
import { textMuted, textPrimary } from '../lib/ui'
import type { Campaign, Language } from '../types'

const lang: Language = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh'

const campaign: Campaign = {
  id: 'demo',
  ownerId: 'owner',
  name: 'Demo',
  remarks: '',
  config: {
    startDate: '2026-11-01',
    endDate: '2026-12-20',
    durationHours: null,
    dayStartHour: 9,
    dayEndHour: 22,
    attendanceTolerance: 0,
  },
  expiryDate: '2026-12-31T23:59:59.000Z',
  onDays: ['2026-11-16', '2026-12-16'],
  compulsoryDays: ['2026-12-16', '2026-12-17'],
  savedSlots: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  adminCode: 'ADMIN',
  organizerCode: 'ORG',
  participantCode: 'PART',
  admins: [],
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
      id: 'dancer-1',
      userId: null,
      name: '參加者',
      email: 'guest@example.com',
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
  if (name === 'setup') {
    return (
      <Shell>
        <SetupPanel lang={lang} isDarkMode readOnly={false} onCancel={() => undefined} onConfirm={() => undefined} />
      </Shell>
    )
  }
  if (name === 'availability') {
    return (
      <Shell>
        <AvailabilityEditor
          lang={lang}
          isDarkMode
          config={campaign.config}
          onDays={campaign.onDays}
          compulsoryDays={campaign.compulsoryDays}
          blocks={[]}
          onChange={() => undefined}
        />
      </Shell>
    )
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

export function mountFixture(name: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Preview name={name} />
    </StrictMode>,
  )
}
