import { useMemo, useState, type FormEvent } from 'react'
import { t } from '../i18n'
import { formatHourOption, formatLongDate, getDaysArray, parseISODate, rangeOptions, toISODateString } from '../lib/dates'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { FieldLabel, InfoTip } from './Guide'
import { InviteCode } from './InviteCode'
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
  onRotateOrganizer,
  onRotateParticipant,
  onRemoveAdmin,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onRotateGroup,
  showGroups = true,
  showInvites = true,
  embedded = false,
}: {
  lang: Language
  isDarkMode: boolean
  initial?: Campaign
  readOnly: boolean
  onCancel: () => void
  onEdit?: () => void
  onConfirm: (input: CampaignInput, newGroups?: string[]) => void
  onCopy?: (value: string, kind?: 'code' | 'link') => void
  onRotateInvite?: () => void
  onRotateOrganizer?: () => void
  onRotateParticipant?: () => void
  onRemoveAdmin?: (adminId: string) => void
  onCreateGroup?: (name: string) => void
  onRenameGroup?: (groupId: string, name: string) => void
  onDeleteGroup?: (groupId: string) => void
  onRotateGroup?: (groupId: string) => void
  showGroups?: boolean
  showInvites?: boolean
  embedded?: boolean
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
      durationHours: null,
      dayStartHour: 9,
      dayEndHour: 22,
      attendanceTolerance: 0,
    },
  )
  const [onDays, setOnDays] = useState<string[]>(initial?.onDays ?? [])
  const [compulsoryDays, setCompulsoryDays] = useState<string[]>(initial?.compulsoryDays ?? [])
  const [markMode, setMarkMode] = useState<'show' | 'must'>('show')
  const [note, setNote] = useState('')
  const [draftGroups, setDraftGroups] = useState<string[]>([])
  const [draftGroup, setDraftGroup] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const days = useMemo(
    () => getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate)),
    [config.startDate, config.endDate],
  )
  const lock = readOnly ? 'pointer-events-none opacity-70' : ''
  const durationOptional = !initial || initial.config.durationHours == null

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
    onConfirm(
      {
        name,
        remarks,
        config,
        expiryDate: expiryDate.toISOString(),
        onDays: [...onDays].sort(),
        compulsoryDays: [...compulsoryDays].sort(),
      },
      initial ? undefined : draftGroups,
    )
  }

  function addDraftGroup(event: FormEvent) {
    event.preventDefault()
    const trimmed = draftGroup.trim()
    if (!trimmed) return
    if (initial && onCreateGroup) onCreateGroup(trimmed)
    else setDraftGroups((current) => [...current, trimmed])
    setDraftGroup('')
  }

  function share(code: string | null, link: string, kind: 'code' | 'link') {
    if (!onCopy) return
    if (kind === 'code' && code) onCopy(code, 'code')
    else if (link) onCopy(link, 'link')
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {embedded ? null : (
      <div className="mb-8 text-center">
        <h2 className={`flex items-center justify-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
          {readOnly ? initial?.name : initial ? t(lang, 'edit_event') : t(lang, 'new_campaign')}
          <InfoTip lang={lang} name="setup" text={t(lang, 'guide_setup')} />
        </h2>
        {readOnly ? <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'view_only')}</p> : null}
      </div>
      )}
      <div className={`${cardClass(isDarkMode)} space-y-6 rounded-[1.5rem] p-4 sm:space-y-8 sm:rounded-[2rem] sm:p-8`}>
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
            <FieldLabel
              lang={lang}
              label={durationOptional ? `${t(lang, 'rehearsal_length')} (${t(lang, 'optional')})` : t(lang, 'rehearsal_length')}
              tip={t(lang, durationOptional ? 'tip_duration_optional' : 'tip_duration')}
              className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}
            />
            <select
              disabled={readOnly}
              value={config.durationHours ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                setConfig({ ...config, durationHours: raw === '' ? null : Number(raw) })
              }}
              className={`w-full rounded-xl px-3 py-3 font-bold ${inputClass(isDarkMode)} ${lock}`}
            >
              {durationOptional ? <option value="">{t(lang, 'duration_unset')}</option> : null}
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

        {showGroups || showInvites ? (
          <div className="space-y-5" data-codes-section="">
            <div className="space-y-3" data-participants-block="">
              <h3 className={`inline-flex items-center gap-2 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                {t(lang, 'participants_label')}
                <InfoTip lang={lang} name="participants" text={t(lang, showGroups && !showInvites ? 'groups_setup_hint' : 'participants_hint')} />
              </h3>
              {showInvites && initial ? (
                <InviteCode
                  lang={lang}
                  isDarkMode={isDarkMode}
                  label={t(lang, 'all_participants')}
                  plainLabel
                  code={preferredInviteCode(initial.participantShort, initial.participantCode)}
                  empty={t(lang, 'organizer_after_create')}
                  readOnly={readOnly}
                  onCopy={(_value, kind) =>
                    share(
                      preferredInviteCode(initial.participantShort, initial.participantCode),
                      preferredInviteLink(initial.participantShort, initial.participantCode, 'participant'),
                      kind,
                    )
                  }
                  onRotate={onRotateParticipant}
                />
              ) : showInvites ? (
                <div className="space-y-1">
                  <p className={`text-xs font-semibold ${textMuted(isDarkMode)}`}>{t(lang, 'all_participants')}</p>
                  <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'organizer_after_create')}</p>
                </div>
              ) : null}
              {showGroups ? (
              <div className="space-y-3 border-l border-current/15 pl-3">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'groups_label')}</p>
                {!readOnly ? (
                  <form onSubmit={addDraftGroup} className={`flex gap-2 ${lock}`}>
                    <input
                      value={draftGroup}
                      onChange={(event) => setDraftGroup(event.target.value)}
                      placeholder={t(lang, 'group_placeholder')}
                      aria-label={t(lang, 'group_placeholder')}
                      className={`min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
                    />
                    <button type="submit" disabled={!draftGroup.trim()} className="min-h-11 shrink-0 rounded-full bg-[#7c7bb9] px-4 text-sm font-bold text-white disabled:opacity-40">
                      {t(lang, 'add_group')}
                    </button>
                  </form>
                ) : null}
                {initial
                  ? initial.groups.length === 0 && <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p>
                  : draftGroups.length === 0 && <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p>}
                {(initial ? initial.groups.length : draftGroups.length) > 0 ? (
                  <div className="space-y-3">
                    {initial
                      ? initial.groups.map((group) => (
                          <div key={group.id} className="space-y-1.5 border-t border-current/10 pt-3" data-group-id={group.id}>
                            <div className="flex items-center justify-between gap-3">
                              {renamingId === group.id && onRenameGroup ? (
                                <input
                                  autoFocus
                                  defaultValue={group.name}
                                  aria-label={t(lang, 'group_placeholder')}
                                  onBlur={(event) => {
                                    setRenamingId(null)
                                    const next = event.target.value.trim()
                                    if (next && next !== group.name) onRenameGroup(group.id, next)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur()
                                    if (event.key === 'Escape') setRenamingId(null)
                                  }}
                                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-bold ${inputClass(isDarkMode)}`}
                                />
                              ) : (
                                <button type="button" onClick={() => !readOnly && onRenameGroup && setRenamingId(group.id)} className={`truncate text-left text-sm font-bold ${textPrimary(isDarkMode)}`}>
                                  {group.name}
                                </button>
                              )}
                              {!readOnly && onDeleteGroup ? (
                                <button
                                  type="button"
                                  className="text-sm font-bold text-[#f19ba8]"
                                  onClick={() => {
                                    if (window.confirm(t(lang, 'delete_group'))) onDeleteGroup(group.id)
                                  }}
                                >
                                  {t(lang, 'remove')}
                                </button>
                              ) : null}
                            </div>
                            <InviteCode
                              lang={lang}
                              isDarkMode={isDarkMode}
                              label=""
                              code={group.inviteCode ?? null}
                              empty={t(lang, 'organizer_after_create')}
                              readOnly={readOnly}
                              onCopy={(_value, kind) =>
                                share(group.inviteCode ?? null, group.inviteCode ? shortInviteUrl(group.inviteCode) : '', kind)
                              }
                              onRotate={!readOnly && onRotateGroup ? () => onRotateGroup(group.id) : undefined}
                            />
                          </div>
                        ))
                      : draftGroups.map((group, index) => (
                          <div key={`${group}-${index}`} className="flex items-center justify-between gap-3">
                            <p className={`truncate text-sm font-bold ${textPrimary(isDarkMode)}`}>{group}</p>
                            <button type="button" className="text-sm font-bold text-[#f19ba8]" onClick={() => setDraftGroups((current) => current.filter((_, item) => item !== index))}>
                              {t(lang, 'remove')}
                            </button>
                          </div>
                        ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
            {showInvites ? (
              <div className="space-y-3 border-t border-current/10 pt-4" data-organizer-block="">
                <h3 className={`inline-flex items-center gap-2 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                  {t(lang, 'choreographer')}
                  <InfoTip lang={lang} name="organizer" text={t(lang, 'organizer_link_hint')} />
                </h3>
                {initial ? (
                  <InviteCode
                    lang={lang}
                    isDarkMode={isDarkMode}
                    label=""
                    code={preferredInviteCode(initial.organizerShort, initial.organizerCode)}
                    empty={t(lang, 'organizer_after_create')}
                    readOnly={readOnly}
                    onCopy={(_value, kind) =>
                      share(
                        preferredInviteCode(initial.organizerShort, initial.organizerCode),
                        preferredInviteLink(initial.organizerShort, initial.organizerCode, 'organizer'),
                        kind,
                      )
                    }
                    onRotate={onRotateOrganizer}
                  />
                ) : (
                  <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'organizer_after_create')}</p>
                )}
              </div>
            ) : null}
            {showInvites ? (
              <div className="space-y-3 border-t border-current/10 pt-4" data-admins-block="">
                <h3 className={`inline-flex items-center gap-2 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                  {t(lang, 'admins_label')}
                  <InfoTip lang={lang} name="admins" text={t(lang, 'invite_admin_hint')} />
                </h3>
                {initial ? (
                  <>
                    <InviteCode
                      lang={lang}
                      isDarkMode={isDarkMode}
                      label=""
                      code={preferredInviteCode(initial.adminShort, initial.adminCode)}
                      empty={t(lang, 'invite_after_create')}
                      readOnly={readOnly}
                      onCopy={(_value, kind) =>
                        share(
                          preferredInviteCode(initial.adminShort, initial.adminCode),
                          preferredInviteLink(initial.adminShort, initial.adminCode, 'admin'),
                          kind,
                        )
                      }
                      onRotate={onRotateInvite}
                    />
                    <div className="space-y-2">
                      {(initial.admins.length ?? 0) === 0 && <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'admins_empty')}</p>}
                      {initial.admins.map((admin) => (
                        <div key={admin.id} className="glass-well flex items-center justify-between rounded-xl px-4 py-3">
                          <div className="min-w-0">
                            <p className={`truncate font-bold ${textPrimary(isDarkMode)}`}>{admin.email}</p>
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
                  </>
                ) : (
                  <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'invite_after_create')}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className={`inline-flex items-center gap-2 font-serif text-2xl ${textPrimary(isDarkMode)}`}>
                {t(lang, 'on_days')} / {t(lang, 'compulsory_days')}
                <InfoTip
                  lang={lang}
                  name="days"
                  text={`${markMode === 'show' ? t(lang, 'on_days_hint') : t(lang, 'compulsory_days_hint')}\n${t(lang, 'legend_marks')}`}
                />
              </h3>
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
          <div className="mx-auto w-full max-w-md">
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
                  className={`cal-day glass-well flex w-full items-center justify-center rounded-lg text-xs font-bold leading-none ${
                    isDarkMode ? 'text-white' : 'text-zinc-800'
                  } ${show ? 'ring-2 ring-[#f6cf7a]' : ''} ${must ? 'outline outline-2 outline-[#f19ba8]' : ''}`}
                >
                  {show ? '★' : ''}
                  {day.getDate()}
                </button>
              )
            }}
          />
          </div>
        </div>

        {note && <p className="font-bold text-[#f19ba8]">{note}</p>}
      </div>
      <div className="dock mt-6 flex justify-center gap-3 sm:mt-8">
        <button type="button" onClick={onCancel} className={`min-h-11 px-6 py-3 font-bold ${textMuted(isDarkMode)}`}>
          {t(lang, 'cancel')}
        </button>
        {readOnly && onEdit ? (
          <button type="button" onClick={onEdit} className="min-h-11 rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white">
            {t(lang, 'edit_event')}
          </button>
        ) : (
          !readOnly && (
            <button type="button" disabled={!name.trim()} onClick={confirm} className="min-h-11 rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white disabled:opacity-40">
              {initial ? t(lang, 'save_campaign') : t(lang, 'create_campaign')}
            </button>
          )
        )}
      </div>
    </div>
  )
}
