import { useMemo, useState } from 'react'
import { AvailabilityEditor } from './AvailabilityEditor'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
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
}) {
  const mine = [...campaign.choreographers, ...campaign.dancers].find((person) => person.userId === userId)
  const role = mine?.role ?? linkRole
  const [name, setName] = useState(mine?.name ?? email.split('@')[0] ?? '')
  const [blocks, setBlocks] = useState<TimeBlock[]>(mine?.blocks ?? [])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const locked = isPast(campaign.expiryDate)
  const plan = useMemo(
    () =>
      analyzeEvent({
        config: campaign.config,
        dancers: mine ? [mine] : [],
        choreographers: [],
        groups: [],
        savedSlots: campaign.savedSlots,
        sessions: [],
      }),
    [campaign, mine],
  )
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
    setBusy(true)
    try {
      const ok = await onSave({ name, role, blocks })
      if (ok) setSaved(true)
    } finally {
      setBusy(false)
    }
  }

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
              const status = mine
                ? classifySessionAttendance(
                    mine,
                    session.start.getTime(),
                    session.end.getTime(),
                    campaign.config.attendanceTolerance,
                  ).status
                : null
              return (
                <li key={session.id} data-confirmed-session="" className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={textPrimary(isDarkMode)}>
                    {formatLongDate(session.start, lang)} · {formatTime(session.start, lang)} – {formatTime(session.end, lang)}
                  </span>
                  {status ? (
                    <span className={status === 'na' ? 'tone-danger font-semibold' : 'font-semibold text-[#93ba8c]'}>
                      {status === 'ok' ? t(lang, 'mode_available') : status === 'partial' ? t(lang, 'partial_label') : t(lang, 'mode_unavailable')}
                    </span>
                  ) : null}
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
        confirmed={plan.sessions}
      />
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
