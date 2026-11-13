import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ResultsPanel } from '../components/ResultsPanel'
import { LANGUAGES } from '../i18n'
import { CalendarProvider } from '../lib/calendarContext'
import { parseISODate, setTime, toISODateString } from '../lib/dates'
import { calculateBestSlots } from '../lib/schedule'
import { textMuted, textPrimary } from '../lib/ui'
import type { BlockKind, Campaign, Language, Person, TimeBlock } from '../types'

const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']

const banner = {
  en: { kicker: 'Preview', body: 'Sample rehearsal. Nothing is saved to a live event.' },
  zh: { kicker: '預覽', body: '示範彩排。不會寫入任何真實活動。' },
} as const

const copy = {
  en: {
    event: 'Spring show rehearsal',
    remarks: 'Studio 2. Please be on time.',
    organizer: 'Koko Lam',
    main: 'Main',
    reserve: 'Reserve',
    tung: 'Wing Tung',
    ching: 'Chi Ching',
    lok: 'Lok Ching',
    kai: 'Hoi Lam',
    zi: 'Tsz Long',
    hiu: 'Hiu Man',
  },
  zh: {
    event: '春季公演彩排',
    remarks: '二號舞蹈室，請準時到達。',
    organizer: '林可嵐',
    main: '主力',
    reserve: '後備',
    tung: '陳詠桐',
    ching: '李芷澄',
    lok: '黃樂晴',
    kai: '張凱琳',
    zi: '吳子朗',
    hiu: '何曉雯',
  },
} as const

function span(id: string, iso: string, start: number, end: number, kind: BlockKind): TimeBlock {
  const day = parseISODate(iso)
  return {
    id: `${id}-${iso}-${kind}-${start}`,
    kind,
    start: setTime(day, start),
    end: setTime(day, end),
    wholeDay: false,
  }
}

function eachDay(id: string, marks: [number, number, BlockKind][]): TimeBlock[] {
  return days.flatMap((iso) => marks.map(([start, end, kind]) => span(id, iso, start, end, kind)))
}

function person(id: string, name: string, role: Person['role'], blocks: TimeBlock[]): Person {
  return {
    id,
    userId: null,
    name,
    email: '',
    role,
    blocks,
    lastUpdated: role === 'dancer' && blocks.length === 0 ? null : '2026-11-14T08:00:00.000Z',
  }
}

export function buildCampaign(lang: Language, savedSlots: string[], durationHours: number | null): Campaign {
  const names = copy[lang]
  const organizer = person('org-lam', names.organizer, 'choreographer', eachDay('org-lam', [[10, 12, 'unavailable']]))
  const dancers = [
    person('dancer-tung', names.tung, 'dancer', eachDay('dancer-tung', [[10, 14, 'unavailable'], [14, 22, 'available']])),
    person('dancer-ching', names.ching, 'dancer', eachDay('dancer-ching', [[19, 22, 'unavailable']])),
    person('dancer-lok', names.lok, 'dancer', eachDay('dancer-lok', [[12, 18, 'available'], [18, 22, 'unavailable']])),
    person('dancer-kai', names.kai, 'dancer', eachDay('dancer-kai', [[16, 22, 'available']])),
    person('dancer-zi', names.zi, 'dancer', eachDay('dancer-zi', [[10, 13, 'unavailable'], [13, 21, 'available']])),
    person('dancer-hiu', names.hiu, 'dancer', []),
  ]
  return {
    id: 'dev-results',
    ownerId: 'dev-preview',
    name: names.event,
    remarks: names.remarks,
    config: {
      startDate: days[0],
      endDate: days[days.length - 1],
      durationHours,
      dayStartHour: 10,
      dayEndHour: 22,
      attendanceTolerance: 0.5,
    },
    expiryDate: '2026-12-01T00:00:00.000Z',
    onDays: ['2026-11-18', '2026-11-20'],
    compulsoryDays: ['2026-11-20'],
    savedSlots,
    createdAt: '2026-11-01T00:00:00.000Z',
    adminCode: null,
    adminShort: null,
    organizerCode: null,
    organizerShort: null,
    participantCode: null,
    participantShort: null,
    admins: [],
    choreographers: [organizer],
    dancers,
    groups: [
      { id: 'group-main', name: names.main, memberIds: ['dancer-tung', 'dancer-ching', 'dancer-lok', 'dancer-hiu'] },
      { id: 'group-reserve', name: names.reserve, memberIds: ['dancer-kai', 'dancer-zi'] },
    ],
  }
}

export function sampleShortlist(): string[] {
  const sample = buildCampaign('en', [], 2)
  const slots = calculateBestSlots(sample.config, sample.choreographers, sample.dancers)
  const wednesday = slots.filter((slot) => toISODateString(slot.start) === '2026-11-18')
  const first = wednesday[0]
  const second = first ? wednesday.find((slot) => slot.start.getTime() >= first.end.getTime()) : undefined
  return [first, second].flatMap((slot) => (slot ? [slot.start.toISOString()] : []))
}

const calendar = {
  token: null,
  note: '',
  connect: () => undefined,
  disconnect: () => undefined,
  setNote: () => undefined,
}

function DevResults() {
  const [lang, setLang] = useState<Language>('zh')
  const [savedSlots, setSavedSlots] = useState<string[]>(sampleShortlist)
  const [durationHours, setDurationHours] = useState<number | null>(2)
  const campaign = useMemo(
    () => buildCampaign(lang, savedSlots, durationHours),
    [lang, savedSlots, durationHours],
  )

  return (
    <div className="theme-dark min-h-dvh" data-preview="" data-dev-results="">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-32 top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[#7c7bb9] opacity-40 blur-3xl" />
      </div>
      <div className="relative z-10">
        <div className="sticky top-0 z-40 border-b border-[#f6cf7a]/30 bg-[#14120c]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md" data-dev-banner="">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
            <p className="min-w-0 text-sm font-medium text-[#f6cf7a]">
              <span className="mr-2 text-[10px] font-bold uppercase tracking-widest">{banner[lang].kicker}</span>
              {banner[lang].body}
            </p>
            <div className="flex shrink-0 gap-1">
              {LANGUAGES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  data-dev-lang={item.code}
                  aria-pressed={lang === item.code}
                  onClick={() => setLang(item.code)}
                  className={`min-h-11 rounded-full px-3 text-xs font-bold ${lang === item.code ? 'bg-[#f6cf7a] text-zinc-900' : textMuted(true)}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <header className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
          <span className="min-w-0">
            <span className={`block truncate text-[15px] font-semibold ${textPrimary(true)}`}>SyncUp</span>
            <span className={`block truncate text-xs ${textMuted(true)}`}>{campaign.name}</span>
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
          <CalendarProvider value={calendar}>
            <ResultsPanel
              lang={lang}
              isDarkMode
              campaign={campaign}
              onBack={() => undefined}
              onSaveSlots={setSavedSlots}
              canPin
              canSetDuration
              onSaveDuration={setDurationHours}
            />
          </CalendarProvider>
        </main>
      </div>
    </div>
  )
}

export function mountDevResults() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DevResults />
    </StrictMode>,
  )
}
