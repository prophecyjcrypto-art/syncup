import { useMemo, useState, type FormEvent } from 'react'
import { formatHourCount, t } from '../i18n'
import { formatHourOption, formatLongDate, getDaysArray, parseISODate, rangeOptions, toISODateString } from '../lib/dates'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { normalizeDurationHours } from '../lib/schedule'
import { consumeDayClick } from '../lib/dayDrag'
import { groupSurface, inputClass, textMuted, textPrimary } from '../lib/ui'
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
  onRemoveAdmin,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
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
  onRemoveAdmin?: (adminId: string) => void
  onCreateGroup?: (name: string) => void
  onRenameGroup?: (groupId: string, name: string) => void
  onDeleteGroup?: (groupId: string) => void
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
  const labelClass = `text-[13px] font-medium leading-5 ${textMuted(isDarkMode)}`
  const fieldClass = `w-full min-w-0 max-w-full box-border rounded-xl px-3 py-2.5 text-[15px] font-medium leading-5 ${inputClass(isDarkMode)} ${lock}`
  const sectionTitle = `inline-flex items-center gap-1.5 text-[15px] font-semibold leading-5 ${textPrimary(isDarkMode)}`
  const group = groupSurface('space-y-4')

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
    if (consumeDayClick()) return
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
    <div className="mx-auto w-full max-w-4xl text-left">
      {embedded ? null : (
      <div className="mb-6">
        <h2 className={`flex items-center gap-2 text-xl font-semibold tracking-tight ${textPrimary(isDarkMode)}`}>
          {readOnly ? initial?.name : initial ? t(lang, 'edit_event') : t(lang, 'new_campaign')}
          <InfoTip lang={lang} name="setup" text={t(lang, 'guide_setup')} />
        </h2>
        {readOnly ? <p className={`mt-1 text-[13px] leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'view_only')}</p> : null}
      </div>
      )}
      <div className="space-y-6">
        <section data-setup-section="timing" className={group}>
          <label className="block space-y-1.5">
            <span className={labelClass}>{t(lang, 'campaign_name')}</span>
            <input
              value={name}
              disabled={readOnly}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="space-y-1.5">
            <span className={labelClass}>{t(lang, 'rehearsal_range')}</span>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="date"
                disabled={readOnly}
                aria-label={t(lang, 'rehearsal_range')}
                value={config.startDate}
                onChange={(event) => setRange('startDate', event.target.value)}
                className={fieldClass}
              />
              <input
                type="date"
                disabled={readOnly}
                aria-label={t(lang, 'rehearsal_range')}
                min={config.startDate}
                value={config.endDate}
                onChange={(event) => setRange('endDate', event.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel lang={lang} label={t(lang, 'daily_availability')} tip={t(lang, 'tip_daily')} className={labelClass} />
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <select
                disabled={readOnly}
                value={config.dayStartHour}
                onChange={(event) => setConfig({ ...config, dayStartHour: Number(event.target.value) })}
                className={fieldClass}
              >
                {rangeOptions(6, 23).map((hour) => (
                  <option key={hour} value={hour}>{formatHourOption(hour)}</option>
                ))}
              </select>
              <select
                disabled={readOnly}
                value={config.dayEndHour}
                onChange={(event) => setConfig({ ...config, dayEndHour: Number(event.target.value) })}
                className={fieldClass}
              >
                {rangeOptions(9, 28).map((hour) => (
                  <option key={hour} value={hour}>{formatHourOption(hour)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2" data-timing-length="">
            <label className="space-y-1.5">
              <FieldLabel
                lang={lang}
                label={durationOptional ? `${t(lang, 'rehearsal_length')} (${t(lang, 'optional')})` : t(lang, 'rehearsal_length')}
                tip={t(lang, durationOptional ? 'tip_duration_optional' : 'tip_duration')}
                className={labelClass}
              />
              <select
                data-duration=""
                disabled={readOnly}
                value={config.durationHours ?? ''}
                onChange={(event) => setConfig({ ...config, durationHours: normalizeDurationHours(event.target.value) })}
                className={fieldClass}
              >
                <option value="">{t(lang, 'duration_unset')}</option>
                {rangeOptions(0.5, 24).map((hour) => (
                  <option key={hour} value={hour}>{formatHourCount(lang, hour)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <FieldLabel lang={lang} label={t(lang, 'tolerance_label')} tip={t(lang, 'tip_buffer')} className={labelClass} />
              <select
                disabled={readOnly}
                value={config.attendanceTolerance}
                onChange={(event) => setConfig({ ...config, attendanceTolerance: Number(event.target.value) })}
                className={fieldClass}
              >
                {rangeOptions(0, 12).map((hour) => (
                  <option key={hour} value={hour}>{formatHourCount(lang, hour)}</option>
                ))}
              </select>
            </label>
          </div>
          <label data-setup-deadline="" className="block space-y-1.5">
            <span className={labelClass}>{t(lang, 'submission_deadline')}</span>
            <input
              type="date"
              disabled={readOnly}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className={fieldClass}
            />
          </label>
        </section>

        <section data-setup-section="days" className={group}>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className={sectionTitle}>
              {t(lang, 'on_days')} / {t(lang, 'compulsory_days')}
              <InfoTip
                lang={lang}
                name="days"
                text={`${markMode === 'show' ? t(lang, 'on_days_hint') : t(lang, 'compulsory_days_hint')}\n${t(lang, 'legend_marks')}`}
              />
            </h3>
            <div className={`glass-well flex rounded-xl p-1 ${lock}`}>
              <button type="button" onClick={() => setMarkMode('show')} className={`rounded-lg px-3 py-2 text-sm font-medium ${markMode === 'show' ? 'bg-[#f6cf7a] text-zinc-900' : textMuted(isDarkMode)}`}>
                {t(lang, 'mark_show')}
              </button>
              <button type="button" onClick={() => setMarkMode('must')} className={`rounded-lg px-3 py-2 text-sm font-medium ${markMode === 'must' ? 'bg-[#f19ba8] text-white' : textMuted(isDarkMode)}`}>
                {t(lang, 'mark_must')}
              </button>
            </div>
          </div>
          <div data-setup-calendar="" className="w-full">
          <MonthBoards
            days={days}
            lang={lang}
            isDarkMode={isDarkMode}
            selected={markMode === 'show' ? onDays : compulsoryDays}
            onSelectRange={readOnly ? undefined : (next) => (markMode === 'show' ? setOnDays(next) : setCompulsoryDays(next))}
            renderDay={(day) => {
              const iso = toISODateString(day)
              const show = onDays.includes(iso)
              const must = compulsoryDays.includes(iso)
              return (
                <button
                  type="button"
                  disabled={readOnly}
                  data-cal-iso={iso}
                  data-day-on={show ? '' : undefined}
                  onClick={() => toggleMark(iso)}
                  aria-label={formatLongDate(day, lang)}
                  className={`cal-day glass-well flex w-full items-center justify-center rounded-lg text-sm font-medium leading-none ${
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
        </section>

        {showGroups || showInvites ? (
          <section data-setup-section="people" className="space-y-4">
          <div className="space-y-5" data-codes-section="">
            <div className="space-y-3" data-participants-block="">
              <h3 className={sectionTitle}>
                {t(lang, 'participants_label')}
                <InfoTip lang={lang} name="participants" text={t(lang, showGroups && !showInvites ? 'groups_setup_hint' : 'participants_hint')} />
              </h3>
              {showInvites && initial ? (
                <div className={group}>
                  <InviteCode
                    lang={lang}
                    isDarkMode={isDarkMode}
                    label={t(lang, 'all_participants')}
                    code={preferredInviteCode(initial.participantShort, initial.participantCode)}
                    empty={t(lang, 'organizer_after_create')}
                    onCopy={(_value, kind) =>
                      share(
                        preferredInviteCode(initial.participantShort, initial.participantCode),
                        preferredInviteLink(initial.participantShort, initial.participantCode, 'participant'),
                        kind,
                      )
                    }
                  />
                </div>
              ) : showInvites ? (
                <div className={group}>
                  <p className={labelClass}>{t(lang, 'all_participants')}</p>
                  <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'organizer_after_create')}</p>
                </div>
              ) : null}
              {showGroups ? (
              <div className="space-y-3">
                <p className={labelClass}>{t(lang, 'groups_label')}</p>
                {!readOnly ? (
                  <form onSubmit={addDraftGroup} className={`flex gap-2 ${lock}`}>
                    <input
                      value={draftGroup}
                      onChange={(event) => setDraftGroup(event.target.value)}
                      placeholder={t(lang, 'group_placeholder')}
                      aria-label={t(lang, 'group_placeholder')}
                      className={`min-w-0 flex-1 ${fieldClass}`}
                    />
                    <button type="submit" disabled={!draftGroup.trim()} className="tone-fill-sage min-h-11 shrink-0 rounded-full px-4 text-sm font-medium disabled:opacity-40">
                      {t(lang, 'add_group')}
                    </button>
                  </form>
                ) : null}
                {initial
                  ? initial.groups.length === 0 && <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p>
                  : draftGroups.length === 0 && <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p>}
                {(initial ? initial.groups.length : draftGroups.length) > 0 ? (
                  <div className="space-y-3">
                    {initial
                      ? initial.groups.map((danceGroup) => (
                          <div key={danceGroup.id} className={group} data-group-id={danceGroup.id}>
                            <div className="flex items-center justify-between gap-3">
                              {renamingId === danceGroup.id && onRenameGroup ? (
                                <input
                                  autoFocus
                                  defaultValue={danceGroup.name}
                                  aria-label={t(lang, 'group_placeholder')}
                                  onBlur={(event) => {
                                    setRenamingId(null)
                                    const next = event.target.value.trim()
                                    if (next && next !== danceGroup.name) onRenameGroup(danceGroup.id, next)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur()
                                    if (event.key === 'Escape') setRenamingId(null)
                                  }}
                                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-[15px] font-medium ${inputClass(isDarkMode)}`}
                                />
                              ) : (
                                <button type="button" onClick={() => !readOnly && onRenameGroup && setRenamingId(danceGroup.id)} className={`truncate text-left text-[15px] font-medium ${textPrimary(isDarkMode)}`}>
                                  {danceGroup.name}
                                </button>
                              )}
                              {!readOnly && onDeleteGroup ? (
                                <button
                                  type="button"
                                  className="text-sm font-medium text-[#f19ba8]"
                                  onClick={() => {
                                    if (window.confirm(t(lang, 'delete_group'))) onDeleteGroup(danceGroup.id)
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
                              code={danceGroup.inviteCode ?? null}
                              empty={t(lang, 'organizer_after_create')}
                              onCopy={(_value, kind) =>
                                share(danceGroup.inviteCode ?? null, danceGroup.inviteCode ? shortInviteUrl(danceGroup.inviteCode) : '', kind)
                              }
                            />
                          </div>
                        ))
                      : draftGroups.map((draft, index) => (
                          <div key={`${draft}-${index}`} className={`${group} flex items-center justify-between gap-3`}>
                            <p className={`truncate text-[15px] font-medium ${textPrimary(isDarkMode)}`}>{draft}</p>
                            <button type="button" className="text-sm font-medium text-[#f19ba8]" onClick={() => setDraftGroups((current) => current.filter((_, item) => item !== index))}>
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
              <div className={group} data-organizer-block="">
                <h3 className={sectionTitle}>
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
                    onCopy={(_value, kind) =>
                      share(
                        preferredInviteCode(initial.organizerShort, initial.organizerCode),
                        preferredInviteLink(initial.organizerShort, initial.organizerCode, 'organizer'),
                        kind,
                      )
                    }
                  />
                ) : (
                  <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'organizer_after_create')}</p>
                )}
              </div>
            ) : null}
            {showInvites ? (
              <div className={group} data-admins-block="">
                <h3 className={sectionTitle}>
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
                      onCopy={(_value, kind) =>
                        share(
                          preferredInviteCode(initial.adminShort, initial.adminCode),
                          preferredInviteLink(initial.adminShort, initial.adminCode, 'admin'),
                          kind,
                        )
                      }
                    />
                    <div className="space-y-2">
                      {(initial.admins.length ?? 0) === 0 && <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'admins_empty')}</p>}
                      {initial.admins.map((admin) => (
                        <div key={admin.id} className="glass-well flex items-center justify-between gap-3 rounded-xl px-4 py-3">
                          <div className="min-w-0">
                            <p className={`truncate text-[15px] font-medium ${textPrimary(isDarkMode)}`}>{admin.email}</p>
                            <p className={`text-[13px] leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'admin_joined')}</p>
                          </div>
                          {!readOnly && onRemoveAdmin && (
                            <button type="button" onClick={() => onRemoveAdmin(admin.id)} className="text-sm font-medium text-[#f19ba8]">
                              {t(lang, 'remove')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className={`text-sm leading-5 ${textMuted(isDarkMode)}`}>{t(lang, 'invite_after_create')}</p>
                )}
              </div>
            ) : null}
          </div>
          </section>
        ) : null}

        <section data-setup-section="notes" className={group}>
          <label className="block space-y-1.5">
            <span className={labelClass}>{t(lang, 'remarks_label')}</span>
            <textarea
              disabled={readOnly}
              rows={3}
              value={remarks}
              placeholder={t(lang, 'remarks_placeholder')}
              onChange={(event) => setRemarks(event.target.value)}
              className={`resize-none ${fieldClass}`}
            />
          </label>
        </section>
        {note && <p className="text-sm font-medium text-[#f19ba8]">{note}</p>}
      </div>
      <div className="mt-6 flex justify-start gap-3">
        <button type="button" onClick={onCancel} className={`min-h-11 px-5 text-sm font-medium ${textMuted(isDarkMode)}`}>
          {t(lang, 'cancel')}
        </button>
        {readOnly && onEdit ? (
          <button type="button" onClick={onEdit} className="btn-glow btn-primary min-h-11 rounded-full px-6 text-sm font-medium">
            {t(lang, 'edit_event')}
          </button>
        ) : (
          !readOnly && (
            <button type="button" disabled={!name.trim()} onClick={confirm} className="btn-glow btn-primary min-h-11 rounded-full px-6 text-sm font-medium disabled:opacity-40">
              {initial ? t(lang, 'save_campaign') : t(lang, 'create_campaign')}
            </button>
          )
        )}
      </div>
    </div>
  )
}
