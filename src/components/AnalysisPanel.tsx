import { useMemo } from 'react'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
import { formatLongDate, formatTime, parseISODate } from '../lib/dates'
import { cardClass, textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { SessionRange } from '../lib/sessions'
import type { Campaign, Language } from '../types'

export function AnalysisPanel({
  lang,
  isDarkMode,
  campaign,
  sessions,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  sessions: SessionRange[]
}) {
  const report = useMemo(
    () =>
      analyzeEvent({
        config: campaign.config,
        dancers: campaign.dancers,
        choreographers: campaign.choreographers,
        groups: campaign.groups,
        savedSlots: campaign.savedSlots,
        sessions,
      }),
    [campaign, sessions],
  )
  const figures = [
    { label: t(lang, 'mode_unavailable'), value: String(report.naCount) },
    { label: t(lang, 'mode_available'), value: String(report.okCount) },
    { label: t(lang, 'stats_responses'), value: `${report.responses}/${report.people}` },
    { label: t(lang, 'stats_session'), value: String(report.sessionHours) },
  ]
  const hourMax = Math.max(1, ...report.dancers.map((person) => person.okHours + person.naHours))

  return (
    <div className="space-y-4" data-analysis="">
      <div className="flex items-center gap-2">
        <h3 className={`font-serif text-xl sm:text-2xl ${textPrimary(isDarkMode)}`}>{t(lang, 'tab_analysis')}</h3>
        <InfoTip lang={lang} name="analysis" text={t(lang, 'guide_stats')} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className={`${cardClass(isDarkMode)} min-w-0 rounded-2xl px-3 py-3`}>
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-400">{figure.label}</p>
            <p className={`text-lg font-bold tabular-nums ${textPrimary(isDarkMode)}`}>{figure.value}</p>
          </div>
        ))}
      </div>
      <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NameList lang={lang} isDarkMode={isDarkMode} title={t(lang, 'stats_responses')} people={report.replied} tone="text-[#93ba8c]" />
          <NameList lang={lang} isDarkMode={isDarkMode} title={t(lang, 'analysis_waiting')} people={report.waiting} tone={textMuted(isDarkMode)} />
        </div>
      </section>
      <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
        <h4 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'filter_dancers')}</h4>
        {report.dancers.length === 0 ? (
          <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'list_empty')}</p>
        ) : (
          report.dancers.map((person) => (
            <div key={person.id} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className={`truncate text-sm font-bold ${textPrimary(isDarkMode)}`}>{person.name}</p>
                <p className={`shrink-0 text-xs tabular-nums ${textMuted(isDarkMode)}`}>
                  {t(lang, 'mode_available')} {person.okHours} · {t(lang, 'mode_unavailable')} {person.naHours}
                </p>
              </div>
              <SplitBar ok={person.okHours} na={person.naHours} max={hourMax} isDarkMode={isDarkMode} />
            </div>
          ))
        )}
      </section>
      {report.groups.length > 0 ? (
        <section className={`${cardClass(isDarkMode)} space-y-3 rounded-[1.5rem] p-4 sm:p-5`}>
          <h4 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'groups_label')}</h4>
          {report.groups.map((group) => (
            <div key={group.id} data-group-id={group.id} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className={`truncate text-sm font-bold ${textPrimary(isDarkMode)}`}>
                  {group.name}
                  <span className={`ml-2 text-xs font-medium ${textMuted(isDarkMode)}`}>{group.people}</span>
                </p>
                <p className={`shrink-0 text-xs tabular-nums ${textMuted(isDarkMode)}`}>
                  {t(lang, 'mode_available')} {group.okHours} · {t(lang, 'mode_unavailable')} {group.naHours}
                  {group.sessionHours > 0 ? ` · ${group.sessionHours}` : ''}
                </p>
              </div>
              <SplitBar ok={group.okHours} na={group.naHours} max={Math.max(hourMax, group.okHours + group.naHours, 1)} isDarkMode={isDarkMode} />
            </div>
          ))}
          {report.ungrouped ? (
            <p className={`text-xs ${textMuted(isDarkMode)}`}>
              {t(lang, 'analysis_ungrouped')} {report.ungrouped.people} · {t(lang, 'mode_available')} {report.ungrouped.okHours} · {t(lang, 'mode_unavailable')} {report.ungrouped.naHours}
            </p>
          ) : null}
        </section>
      ) : null}
      <section className={`${cardClass(isDarkMode)} space-y-2 rounded-[1.5rem] p-4 sm:p-5`}>
        <h4 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_days')}</h4>
        {report.days.length === 0 ? (
          <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_none')}</p>
        ) : (
          report.days.map((day) => (
            <div key={day.iso} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
              <p className={`truncate text-xs font-bold ${textPrimary(isDarkMode)}`}>{formatLongDate(parseISODate(day.iso), lang)}</p>
              <div className={`h-1.5 overflow-hidden rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-black/10'}`}>
                <div className="h-full bg-[#7c7bb9]" style={{ width: day.total === 0 ? '0%' : `${(day.freePeak / day.total) * 100}%` }} />
              </div>
              <p className={`text-right text-xs tabular-nums ${textMuted(isDarkMode)}`}>
                {day.freePeak}/{day.total}
              </p>
            </div>
          ))
        )}
      </section>
      <section className={`${cardClass(isDarkMode)} space-y-2 rounded-[1.5rem] p-4 sm:p-5`}>
        <h4 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
          {t(lang, 'stats_session')} · {report.sessionHours}
        </h4>
        {report.sessions.length === 0 ? (
          <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_none')}</p>
        ) : (
          report.sessions.map((session) => (
            <div key={session.id} className="min-w-0">
              <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>
                {formatLongDate(session.start, lang)} · {formatTime(session.start, lang)} – {formatTime(session.end, lang)}
                <span className={`ml-2 text-xs font-medium ${textMuted(isDarkMode)}`}>{session.hours}</span>
              </p>
              {session.groups.length > 0 ? (
                <p className={`truncate text-xs ${textMuted(isDarkMode)}`}>
                  {session.groups.map((group) => `${group.name} ${group.free}/${group.total}`).join(' · ')}
                </p>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function NameList({
  lang,
  isDarkMode,
  title,
  people,
  tone,
}: {
  lang: Language
  isDarkMode: boolean
  title: string
  people: { id: string; name: string }[]
  tone: string
}) {
  return (
    <div className="min-w-0">
      <p className={`text-xs font-bold uppercase tracking-widest ${tone}`}>
        {title} {people.length}
      </p>
      {people.length === 0 ? (
        <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_none')}</p>
      ) : (
        <p className={`mt-1 text-sm ${textPrimary(isDarkMode)}`}>{people.map((person) => person.name).join(', ')}</p>
      )}
    </div>
  )
}

function SplitBar({ ok, na, max, isDarkMode }: { ok: number; na: number; max: number; isDarkMode: boolean }) {
  const scale = max > 0 ? max : 1
  return (
    <div className={`flex h-1.5 overflow-hidden rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-black/10'}`}>
      <div className="h-full bg-[#93ba8c]" style={{ width: `${(ok / scale) * 100}%` }} />
      <div className="h-full bg-[#f19ba8]" style={{ width: `${(na / scale) * 100}%` }} />
    </div>
  )
}
