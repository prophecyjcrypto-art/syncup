import { useMemo, useState } from 'react'
import { AvailabilityEditor } from './AvailabilityEditor'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
import {
  conflictingSessionKeys,
  mergeKeepingSessions,
  proposeMissedSession,
  readChangeRequests,
  storeBlocks,
  type ChangeRequest,
  type PublishedWindow,
} from '../lib/changeRequests'
import { publishedSlotKeys } from '../lib/sessionNotes'
import { formatLongDate, formatTime, isPast, parseISODate } from '../lib/dates'
import { classifySessionAttendance, incompleteCompulsoryDays, uncoveredDays } from '../lib/schedule'
import { groupSurface, inputClass, textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { Campaign, Language, PersonRole, TimeBlock } from '../types'

export function DancerPortal({
  lang,
  isDarkMode,
  campaign,
  userId,
  email,
  linkRole,
  intent = 'participant',
  limited = false,
  onBack,
  onSave,
  onSubmitRequest,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  userId: string
  email: string
  linkRole: PersonRole
  intent?: 'participant' | 'organizer' | 'admin'
  limited?: boolean
  onBack: () => void
  onSave: (input: { name: string; role: PersonRole; blocks: TimeBlock[] }) => Promise<boolean>
  onSubmitRequest?: (requests: ChangeRequest[]) => void
}) {
  const mine = [...campaign.choreographers, ...campaign.dancers].find((person) => person.userId === userId)
  const role = mine?.role ?? linkRole
  const [name, setName] = useState(mine?.name ?? email.split('@')[0] ?? '')
  const [committed, setCommitted] = useState<TimeBlock[]>(mine?.blocks ?? [])
  const [blocks, setBlocks] = useState<TimeBlock[]>(mine?.blocks ?? [])
  const [requests, setRequests] = useState<ChangeRequest[]>(() => readChangeRequests(campaign.config.changeRequests))
  const [sheetKey, setSheetKey] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const locked = isPast(campaign.expiryDate)
  const viewer = mine ? { ...mine, blocks: committed } : mine
  const plan = useMemo(
    () =>
      analyzeEvent({
        config: campaign.config,
        dancers: viewer ? [viewer] : [],
        choreographers: [],
        groups: [],
        savedSlots: publishedSlotKeys(campaign.savedSlots, campaign.config.sessionNotes),
        sessions: [],
      }),
    [campaign, viewer],
  )
  const published = useMemo<PublishedWindow[]>(() => {
    const hours = campaign.config.durationHours ?? 0
    return publishedSlotKeys(campaign.savedSlots, campaign.config.sessionNotes).flatMap((key) => {
      const start = new Date(key)
      if (Number.isNaN(start.getTime()) || hours <= 0) return []
      return [{ key, start, end: new Date(start.getTime() + hours * 3600000) }]
    })
  }, [campaign])
  const attended = plan.dancers.find((person) => person.id === mine?.id)?.attendedHours ?? 0

  async function save() {
    if (!name.trim()) {
      window.alert(t(lang, 'enter_name_alert'))
      return
    }
    const uncovered = uncoveredDays(campaign.config, blocks)
    if (uncovered.length) {
      const days = uncovered.map((iso) => formatLongDate(parseISODate(iso), lang)).join(', ')
      window.alert(t(lang, 'mixed_incomplete', { days }))
      return
    }
    const missing = incompleteCompulsoryDays(campaign.config, blocks, campaign.compulsoryDays)
    if (missing.length) {
      const days = missing.map((iso) => formatLongDate(parseISODate(iso), lang)).join(', ')
      if (!window.confirm(t(lang, 'compulsory_save_warning', { days }))) return
    }
    const toleranceMs = campaign.config.attendanceTolerance * 3600000
    const conflicts = conflictingSessionKeys(committed, blocks, published, toleranceMs)
    const kept = conflicts.length === 0 ? blocks : mergeKeepingSessions(committed, blocks, published.filter((session) => conflicts.includes(session.key)))
    setBusy(true)
    try {
      const ok = await onSave({ name, role, blocks: kept })
      if (!ok) return
      setBlocks(kept)
      setCommitted(kept)
      setSaved(conflicts.length === 0)
      if (conflicts.length === 0) return
      const request: ChangeRequest = {
        id: crypto.randomUUID(),
        personId: mine?.id ?? userId,
        personName: name.trim(),
        sessionKeys: conflicts,
        previousBlocks: storeBlocks(committed),
        proposedBlocks: storeBlocks(blocks),
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const next = [...requests, request]
      setRequests(next)
      setNotice(t(lang, 'request_sent'))
      onSubmitRequest?.(next)
    } finally {
      setBusy(false)
    }
  }

  function cantMake(session: { id: string; start: Date; end: Date }) {
    const proposed = proposeMissedSession(committed, session.start, session.end)
    const request: ChangeRequest = {
      id: crypto.randomUUID(),
      personId: mine?.id ?? userId,
      personName: name.trim() || email,
      sessionKeys: [session.id],
      previousBlocks: storeBlocks(committed),
      proposedBlocks: storeBlocks(proposed),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const next = [...requests, request]
    setRequests(next)
    setNotice(t(lang, 'request_sent'))
    setSheetKey(null)
    onSubmitRequest?.(next)
  }

  const sheet = plan.sessions.find((session) => session.id === sheetKey) ?? null
  const mineRequests = requests.filter((request) => request.status === 'pending' && request.personId === (mine?.id ?? userId))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
        ← {t(lang, 'back_home')}
      </button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={`inline-flex flex-wrap items-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
            {campaign.name}
            <InfoTip lang={lang} name="portal" text={t(lang, 'guide_portal')} />
          </h2>
          <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>
            {intent === 'organizer' ? t(lang, 'organizer_time') : intent === 'admin' ? t(lang, 'admin_time') : t(lang, 'dancer')} · {email}
          </p>
          {limited ? <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'results_private')}</p> : null}
        </div>
        <p className={`rounded-full px-4 py-2 text-xs font-bold uppercase ${locked ? 'bg-zinc-700 text-zinc-300' : 'glass-well'}`}>
          {locked ? t(lang, 'expired') : `${t(lang, 'deadline')} ${formatLongDate(new Date(campaign.expiryDate), lang)}`}
        </p>
      </div>
      {campaign.remarks && (
        <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-yellow-700/40 bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50'}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-600">{t(lang, 'remarks_label')}</p>
          <p className={`mt-2 whitespace-pre-wrap text-sm ${textPrimary(isDarkMode)}`}>{campaign.remarks}</p>
        </div>
      )}
      {locked && <p className="rounded-xl bg-[#f19ba8]/15 px-4 py-3 text-sm font-bold text-[#f19ba8]">{t(lang, 'locked_msg')}</p>}
      {notice ? <p data-request-notice="" className="text-sm font-medium text-[#f6cf7a]">{notice}</p> : null}
      {mineRequests.length > 0 ? (
        <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'change_request')} · {mineRequests.length}</p>
      ) : null}
      <section className={groupSurface('space-y-3')} data-participant-plan="">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`text-[15px] font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'confirmed_sessions')}</h3>
          <p className={`text-sm font-semibold tabular-nums ${textPrimary(isDarkMode)}`} data-attended-hours={attended}>
            {t(lang, 'analysis_attended')} {attended}
          </p>
        </div>
        {plan.sessions.length === 0 ? (
          <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_attended_empty')}</p>
        ) : (
          <ul className="space-y-2">
            {plan.sessions.map((session) => {
              const status = viewer
                ? classifySessionAttendance(
                    viewer,
                    session.start.getTime(),
                    session.end.getTime(),
                    campaign.config.attendanceTolerance,
                  ).status
                : null
              const note = campaign.config.sessionNotes?.[session.id]
              return (
                <li key={session.id} data-confirmed-session="" className="space-y-1 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <button type="button" data-open-session={session.id} className={`min-w-0 text-left ${textPrimary(isDarkMode)}`} onClick={() => setSheetKey(session.id)}>
                      {formatLongDate(session.start, lang)} · {formatTime(session.start, lang)} – {formatTime(session.end, lang)}
                    </button>
                    {status ? (
                      <span className={status === 'na' ? 'tone-danger font-semibold' : 'font-semibold text-[#93ba8c]'}>
                        {status === 'ok' ? t(lang, 'mode_available') : status === 'partial' ? t(lang, 'partial_label') : t(lang, 'mode_unavailable')}
                      </span>
                    ) : null}
                  </div>
                  {note?.venue ? <p data-venue={note.venue} className={textPrimary(isDarkMode)}>{note.venue}</p> : null}
                  {note?.remarks ? <p data-session-remarks={note.remarks} className={`whitespace-pre-wrap ${textMuted(isDarkMode)}`}>{note.remarks}</p> : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <label className="block max-w-md space-y-2">
        <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'member_name')}</span>
        <input
          value={name}
          disabled={locked}
          onChange={(event) => setName(event.target.value)}
          className={`box-border w-full min-w-0 max-w-full rounded-2xl px-4 py-3 font-bold ${inputClass(isDarkMode)}`}
        />
      </label>
      <AvailabilityEditor
        lang={lang}
        isDarkMode={isDarkMode}
        config={campaign.config}
        onDays={campaign.onDays}
        compulsoryDays={campaign.compulsoryDays}
        blocks={blocks}
        onChange={setBlocks}
        disabled={locked}
        confirmed={plan.sessions.map((session) => ({
          id: session.id,
          start: session.start,
          end: session.end,
          venue: campaign.config.sessionNotes?.[session.id]?.venue,
          remarks: campaign.config.sessionNotes?.[session.id]?.remarks,
        }))}
        onOpenConfirmed={(session) => setSheetKey(session.id ?? session.start.toISOString())}
      />
      {sheet ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setSheetKey(null)}>
          <div
            role="dialog"
            aria-modal="true"
            data-session-sheet=""
            className={`${groupSurface('w-full max-w-md space-y-3')}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={`text-sm font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'session_details')}</h3>
            <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>
              {formatLongDate(sheet.start, lang)} · {formatTime(sheet.start, lang)} – {formatTime(sheet.end, lang)}
            </p>
            {campaign.config.sessionNotes?.[sheet.id]?.venue ? (
              <p className={`text-sm ${textPrimary(isDarkMode)}`}>{campaign.config.sessionNotes[sheet.id]?.venue}</p>
            ) : null}
            {campaign.config.sessionNotes?.[sheet.id]?.remarks ? (
              <p className={`whitespace-pre-wrap text-sm ${textMuted(isDarkMode)}`}>{campaign.config.sessionNotes[sheet.id]?.remarks}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-cant-make="" onClick={() => cantMake(sheet)} className="tone-fill-pink min-h-11 rounded-full px-4 text-xs font-bold">
                {t(lang, 'cant_make_session')}
              </button>
              <button type="button" onClick={() => setSheetKey(null)} className="glass-well min-h-11 rounded-full px-4 text-xs font-bold">
                {t(lang, 'cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!locked && (
        <div className="dock">
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-glow btn-primary min-h-11 w-full rounded-full px-8 py-3 font-bold disabled:opacity-40 sm:w-auto">
          {saved && !busy ? t(lang, 'saved_ok') : busy ? t(lang, 'loading') : t(lang, 'sync_changes')}
        </button>
        </div>
      )}
    </div>
  )
}
