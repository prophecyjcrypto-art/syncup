import { useMemo, useState } from 'react'
import { t } from '../i18n'
import { formatHourOption, formatLongDate, getDaysArray, parseISODate, rangeOptions, toISODateString } from '../lib/dates'
import { adminInviteUrl } from '../lib/invites'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { FieldLabel, GuideNote } from './Guide'
import type { AppConfig, Campaign, CampaignInput, Language } from '../types'
import { MonthBoards } from './MonthBoards'

export function SetupPanel({
  lang,
  isDarkMode,
  initial,
  readOnly,
  onCancel,
  onEdit,
  onConfirm,
  onCopy,
  onRotateInvite,
  onRemoveAdmin,
}: {
  lang: Language
  isDarkMode: boolean
  initial?: Campaign
  readOnly: boolean
  onCancel: () => void
  onEdit?: () => void
  onConfirm: (input: CampaignInput) => void
  onCopy?: (value: string) => void
  onRotateInvite?: () => void
  onRemoveAdmin?: (adminId: string) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')
  const [expiry, setExpiry] = useState(
    initial?.expiryDate
      ? toISODateString(new Date(initial.expiryDate))
      : toISODateString(new Date(Date.now() + 7 * 86400000)),
  )
  const [config, setConfig] = useState<AppConfig>(
    initial?.config ?? {
      startDate: toISODateString(new Date()),
      endDate: toISODateString(new Date(Date.now() + 14 * 86400000)),
      durationHours: 3,
      dayStartHour: 9,
      dayEndHour: 22,
      attendanceTolerance: 0,
    },
  )
  const [onDays, setOnDays] = useState<string[]>(initial?.onDays ?? [])
  const [compulsoryDays, setCompulsoryDays] = useState<string[]>(initial?.compulsoryDays ?? [])
  const [markMode, setMarkMode] = useState<'show' | 'must'>('show')
  const [note, setNote] = useState('')
  const days = useMemo(
    () => getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate)),
    [config.startDate, config.endDate],
  )
  const lock = readOnly ? 'pointer-events-none opacity-70' : ''

  function setRange(field: 'startDate' | 'endDate', value: string) {
    setConfig((current) => {
      const next = { ...current, [field]: value }
      if (next.endDate < next.startDate) next.endDate = next.startDate
      setOnDays((dates) => dates.filter((date) => date >= next.startDate && date <= next.endDate))
      setCompulsoryDays((dates) => dates.filter((date) => date >= next.startDate && date <= next.endDate))
      return next
    })
  }

  function toggleMark(iso: string) {
    const update = (dates: string[]) => (dates.includes(iso) ? dates.filter((date) => date !== iso) : [...dates, iso].sort())
    if (markMode === 'show') setOnDays(update)
    else setCompulsoryDays(update)
  }

  function confirm() {
    if (!name.trim()) return
    if (config.endDate < config.startDate) {
      setNote(t(lang, 'range_order'))
      return
    }
    if (config.dayEndHour <= config.dayStartHour) {
      setNote(t(lang, 'daily_order'))
      return
    }
    const expiryDate = new Date(`${expiry}T23:59:59`)
    onConfirm({
      name,
      remarks,
      config,
      expiryDate: expiryDate.toISOString(),
      onDays: [...onDays].sort(),
      compulsoryDays: [...compulsoryDays].sort(),
    })
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8 text-center">
        <h2 className={`font-serif text-4xl font-semibold ${textPrimary(isDarkMode)}`}>
          {readOnly ? initial?.name : initial ? t(lang, 'edit_event') : t(lang, 'new_campaign')}
        </h2>
        <GuideNote className="mx-auto">
          {t(lang, 'guide_setup')}
          {readOnly ? ` · ${t(lang, 'view_only')}` : ''}
        </GuideNote>
      </div>
      <div className={`${cardClass(isDarkMode)} space-y-8 rounded-[2rem] p-8`}>
        <label className="block space-y-2">
          <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'campaign_name')}</span>
          <input
            value={name}
            disabled={readOnly}
            onChange={(event) => setName(event.target.value)}
            className={`w-full rounded-2xl px-4 py-3 text-lg font-bold ${inputClass(isDarkMode)} ${lock}`}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'rehearsal_range')}</span>
            <input
              type="date"
              disabled={readOnly}
              value={config.startDate}
              onChange={(event) => setRange('startDate', event.target.value)}
              className={`w-full rounded-xl px-4 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            />
          </label>
          <label className="space-y-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>&nbsp;</span>
            <input
              type="date"
              disabled={readOnly}
              min={config.startDate}
              value={config.endDate}
              onChange={(event) => setRange('endDate', event.target.value)}
              className={`w-full rounded-xl px-4 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel lang={lang} label={t(lang, 'daily_availability')} tip={t(lang, 'tip_daily')} className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`} />
            <div className="flex gap-2">
              <select
                disabled={readOnly}
                value={config.dayStartHour}
                onChange={(event) => setConfig({ ...config, dayStartHour: Number(event.target.value) })}
                className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)} ${lock}`}
              >
                {rangeOptions(6, 23).map((hour) => (
                  <option key={hour} value={hour}>{formatHourOption(hour)}</option>
                ))}
              </select>
              <select
                disabled={readOnly}
                value={config.dayEndHour}
                onChange={(event) => setConfig({ ...config, dayEndHour: Number(event.target.value) })}
                className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)} ${lock}`}
              >
                {rangeOptions(9, 28).map((hour) => (
                  <option key={hour} value={hour}>{formatHourOption(hour)}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="space-y-2">
            <FieldLabel lang={lang} label={t(lang, 'rehearsal_length')} tip={t(lang, 'tip_duration')} className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`} />
            <select
              disabled={readOnly}
              value={config.durationHours}
              onChange={(event) => setConfig({ ...config, durationHours: Number(event.target.value) })}
              className={`w-full rounded-xl px-3 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            >
              {rangeOptions(0.5, 24).map((hour) => (
                <option key={hour} value={hour}>{hour} {t(lang, 'hours')}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'submission_deadline')}</span>
            <input
              type="date"
              disabled={readOnly}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className={`w-full rounded-xl px-4 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            />
          </label>
          <label className="space-y-2">
            <FieldLabel lang={lang} label={t(lang, 'tolerance_label')} tip={t(lang, 'tip_buffer')} className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`} />
            <select
              disabled={readOnly}
              value={config.attendanceTolerance}
              onChange={(event) => setConfig({ ...config, attendanceTolerance: Number(event.target.value) })}
              className={`w-full rounded-xl px-3 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            >
              {rangeOptions(0, 12).map((hour) => (
                <option key={hour} value={hour}>{hour} {t(lang, 'hours')}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-2">
          <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'remarks_label')}</span>
          <textarea
            disabled={readOnly}
            rows={3}
            value={remarks}
            placeholder={t(lang, 'remarks_placeholder')}
            onChange={(event) => setRemarks(event.target.value)}
            className={`w-full resize-none rounded-2xl px-4 py-3 ${inputClass(isDarkMode)} ${lock}`}
          />
        </label>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className={`font-serif text-2xl ${textPrimary(isDarkMode)}`}>{t(lang, 'on_days')} / {t(lang, 'compulsory_days')}</h3>
              <p className={`mt-1 text-sm ${textMuted(isDarkMode)}`}>
                {markMode === 'show' ? t(lang, 'on_days_hint') : t(lang, 'compulsory_days_hint')}
                {' '}
                {t(lang, 'legend_marks')}
              </p>
            </div>
            <div className={`glass-well flex rounded-xl p-1 ${lock}`}>
              <button type="button" onClick={() => setMarkMode('show')} className={`rounded-lg px-3 py-2 text-xs font-bold ${markMode === 'show' ? 'bg-[#f6cf7a] text-zinc-900' : textMuted(isDarkMode)}`}>
                {t(lang, 'mark_show')}
              </button>
              <button type="button" onClick={() => setMarkMode('must')} className={`rounded-lg px-3 py-2 text-xs font-bold ${markMode === 'must' ? 'bg-[#f19ba8] text-white' : textMuted(isDarkMode)}`}>
                {t(lang, 'mark_must')}
              </button>
            </div>
          </div>
          <MonthBoards
            days={days}
            lang={lang}
            isDarkMode={isDarkMode}
            renderDay={(day) => {
              const iso = toISODateString(day)
              const show = onDays.includes(iso)
              const must = compulsoryDays.includes(iso)
              return (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleMark(iso)}
                  aria-label={formatLongDate(day, lang)}
                  className={`glass-well flex aspect-square w-full flex-col items-center justify-center rounded-xl text-sm font-bold ${
                    isDarkMode ? 'text-white' : 'text-zinc-800'
                  } ${show ? 'ring-2 ring-[#f6cf7a]' : ''} ${must ? 'outline outline-2 outline-[#f19ba8]' : ''}`}
                >
                  {day.getDate()}
                  <span className="text-[8px]">
                    {show ? t(lang, 'show_badge') : ''}
                    {show && must ? ' · ' : ''}
                    {must ? t(lang, 'must_badge') : ''}
                  </span>
                </button>
              )
            }}
          />
        </div>

        <div className="space-y-3">
          <h3 className={`font-serif text-2xl ${textPrimary(isDarkMode)}`}>{t(lang, 'admins_label')}</h3>
          <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'invite_admin_hint')}</p>
          {initial?.adminCode ? (
            <div className="space-y-3">
              <p className={`break-all rounded-xl px-4 py-3 text-sm ${inputClass(isDarkMode)}`}>{adminInviteUrl(initial.adminCode)}</p>
              <p className={`font-mono text-sm tracking-wide ${textPrimary(isDarkMode)}`}>{initial.adminCode}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onCopy?.(adminInviteUrl(initial.adminCode!))} className="rounded-xl btn-glow bg-[#7c7bb9] px-4 py-3 text-sm font-bold text-white">
                  {t(lang, 'copy_invite')}
                </button>
                <button type="button" onClick={() => onCopy?.(initial.adminCode!)} className="glass-well rounded-xl px-4 py-3 text-sm font-bold">
                  {t(lang, 'copy_code')}
                </button>
                {!readOnly && onRotateInvite && (
                  <button type="button" onClick={onRotateInvite} className="rounded-xl px-4 py-3 text-sm font-bold text-[#f19ba8]">
                    {t(lang, 'rotate_invite')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'invite_after_create')}</p>
          )}
          <div className="space-y-2">
            {(initial?.admins.length ?? 0) === 0 && <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'admins_empty')}</p>}
            {initial?.admins.map((admin) => (
              <div key={admin.id} className="glass-well flex items-center justify-between rounded-xl px-4 py-3">
                <div>
                  <p className={`font-bold ${textPrimary(isDarkMode)}`}>{admin.email}</p>
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{t(lang, 'admin_joined')}</p>
                </div>
                {!readOnly && onRemoveAdmin && (
                  <button type="button" onClick={() => onRemoveAdmin(admin.id)} className="text-sm font-bold text-[#f19ba8]">
                    {t(lang, 'remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {note && <p className="font-bold text-[#f19ba8]">{note}</p>}
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <button type="button" onClick={onCancel} className={`px-6 py-3 font-bold ${textMuted(isDarkMode)}`}>
          {t(lang, 'cancel')}
        </button>
        {readOnly && onEdit ? (
          <button type="button" onClick={onEdit} className="rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white">
            {t(lang, 'edit_event')}
          </button>
        ) : (
          !readOnly && (
            <button type="button" disabled={!name.trim()} onClick={confirm} className="rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white disabled:opacity-40">
              {initial ? t(lang, 'save_campaign') : t(lang, 'create_campaign')}
            </button>
          )
        )}
      </div>
    </div>
  )
}
