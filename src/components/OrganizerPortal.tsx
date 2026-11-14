import { useMemo, useState, type FormEvent } from 'react'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
import { membershipChanges, peopleForTray } from '../lib/groups'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { cardClass, groupSurface, inputClass, textMuted, textPrimary } from '../lib/ui'
import type { Campaign, CampaignInput, Language } from '../types'
import { AssignBoard, AssignChips, AssignRoleTarget, AssignTarget, AssignTray, useAssigning } from './GroupAssign'
import { organizersOf, type RoleGrantKind } from '../lib/roles'
import { InfoTip } from './Guide'
import { InviteCode } from './InviteCode'
import { SetupPanel } from './SetupPanel'

export type HubTab = 'event' | 'organizers' | 'participants' | 'results'

export function OrganizerPortal({
  lang,
  isDarkMode,
  campaign,
  canEditEvent,
  initialTab = 'participants',
  onBack,
  onSchedule,
  onCopy,
  onSave,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleMember,
  onRemoveAdmin,
  onGrantRole,
  onOrganizerTime,
  onAdminTime,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  canEditEvent: boolean
  initialTab?: HubTab
  onBack: () => void
  onSchedule: () => void
  onCopy: (value: string, kind: 'code' | 'link') => void
  onSave: (input: CampaignInput) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDeleteGroup: (groupId: string) => void
  onToggleMember: (groupId: string, personId: string, included: boolean) => void | Promise<unknown>
  onRemoveAdmin?: (adminId: string) => void
  onGrantRole?: (personId: string, role: RoleGrantKind) => void | Promise<unknown>
  onOrganizerTime?: () => void
  onAdminTime?: () => void
}) {
  const [tab, setTab] = useState<HubTab>(initialTab === 'results' ? 'participants' : initialTab)
  const [groupName, setGroupName] = useState('')
  const report = useMemo(
    () =>
      analyzeEvent({
        config: campaign.config,
        dancers: campaign.dancers,
        choreographers: campaign.choreographers,
        groups: campaign.groups,
        savedSlots: campaign.savedSlots,
        sessions: [],
      }),
    [campaign],
  )
  const dancerById = useMemo(() => new Map(campaign.dancers.map((person) => [person.id, person])), [campaign.dancers])
  const organizers = useMemo(() => organizersOf(campaign), [campaign])
  const steps: { id: HubTab; label: string; accent: string }[] = [
    { id: 'event', label: t(lang, 'flow_event'), accent: 'tone-fill-purple' },
    { id: 'organizers', label: t(lang, 'manage_leadership'), accent: 'tone-fill-gold' },
    { id: 'participants', label: t(lang, 'manage_members'), accent: 'tone-fill-sage' },
    { id: 'results', label: t(lang, 'results'), accent: 'tone-fill-purple' },
  ]

  function addGroup(event: FormEvent) {
    event.preventDefault()
    const name = groupName.trim()
    if (!name) return
    onCreateGroup(name)
    setGroupName('')
  }

  function copyInvite(code: string | null, link: string, kind: 'code' | 'link') {
    if (kind === 'code' && code) onCopy(code, 'code')
    else if (link) onCopy(link, 'link')
  }

  async function moveDancer(personId: string, fromGroupId: string | null, toGroupId: string | null) {
    const changes = membershipChanges(campaign.groups, personId, fromGroupId, toGroupId)
    for (const change of changes) await onToggleMember(change.groupId, personId, change.included)
  }

  function grantRole(personId: string, role: RoleGrantKind) {
    if (!onGrantRole) return
    void onGrantRole(personId, role)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" data-hub={tab}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
          ← {t(lang, 'back_home')}
        </button>
      </div>
      <div>
        <h2 className={`inline-flex flex-wrap items-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
          {campaign.name}
          <InfoTip lang={lang} name="hub" text={t(lang, 'hub_hint')} />
        </h2>
        <p className={`mt-2 text-sm tabular-nums ${textMuted(isDarkMode)}`}>
          {t(lang, 'stats_responses')} {report.responses}/{report.people}
        </p>
      </div>
      <div data-hub-steps="" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((item, index) => {
          const active = item.id !== 'results' && tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              data-hub-step={item.id}
              data-accent={item.id === 'organizers' ? 'gold' : item.id === 'participants' ? 'sage' : 'purple'}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (item.id === 'results') onSchedule()
                else setTab(item.id)
              }}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-2 text-sm font-semibold ${active ? item.accent : 'glass-well'}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${active ? '' : item.accent}`}>{index + 1}</span>
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'participants' || tab === 'organizers' ? (
        <div className="space-y-4">
          <div className="space-y-3" data-codes-section="">
            <AssignBoard onMove={(personId, fromGroupId, toGroupId) => void moveDancer(personId, fromGroupId, toGroupId)} onGrant={grantRole}>
              <div className="space-y-3" data-participants-block="" style={{ order: tab === 'organizers' ? 2 : 0 }}>
                <h3 className={`inline-flex items-center gap-2 px-1 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                  {t(lang, 'participants_label')}
                  <InfoTip lang={lang} name="participants" text={t(lang, 'participants_hint')} />
                </h3>
                <div className={groupSurface('space-y-3')}>
                  <InviteCode
                    lang={lang}
                    isDarkMode={isDarkMode}
                    label={t(lang, 'all_participants')}
                    code={preferredInviteCode(campaign.participantShort, campaign.participantCode)}
                    empty={t(lang, 'organizer_after_create')}
                    onCopy={(_value, kind) =>
                      copyInvite(
                        preferredInviteCode(campaign.participantShort, campaign.participantCode),
                        preferredInviteLink(campaign.participantShort, campaign.participantCode, 'participant'),
                        kind,
                      )
                    }
                  />
                  {campaign.groups.length > 0 && campaign.dancers.length > 0 ? (
                    <AssignTray
                      targetId={null}
                      people={peopleForTray(campaign.dancers, campaign.groups, null)}
                      isDarkMode={isDarkMode}
                      ariaLabel={t(lang, 'all_participants')}
                    />
                  ) : null}
                </div>
                <div className="space-y-3">
                  <p className={`px-1 text-[13px] font-medium ${textMuted(isDarkMode)}`}>{t(lang, 'groups_label')}</p>
                  <form onSubmit={addGroup} className="flex gap-2">
                    <input
                      value={groupName}
                      onChange={(event) => setGroupName(event.target.value)}
                      placeholder={t(lang, 'group_placeholder')}
                      aria-label={t(lang, 'group_placeholder')}
                      className={`min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
                    />
                    <button type="submit" disabled={!groupName.trim()} className="btn-primary min-h-11 shrink-0 rounded-full px-4 text-sm font-bold disabled:opacity-40">
                      {t(lang, 'add_group')}
                    </button>
                  </form>
                  {campaign.groups.length === 0 ? <p className={`px-1 text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p> : null}
                  {campaign.groups.map((danceGroup) => (
                    <div key={danceGroup.id} className={groupSurface('space-y-1.5')} data-group-id={danceGroup.id}>
                      <AssignTarget targetId={danceGroup.id} ariaLabel={danceGroup.name}>
                        <div className="flex min-h-11 items-center justify-between gap-3">
                          <GroupName lang={lang} isDarkMode={isDarkMode} name={danceGroup.name} onRename={(name) => onRenameGroup(danceGroup.id, name)} />
                          <button
                            type="button"
                            className="shrink-0 text-sm font-bold text-[#f19ba8]"
                            onClick={() => {
                              if (window.confirm(t(lang, 'delete_group'))) onDeleteGroup(danceGroup.id)
                            }}
                          >
                            {t(lang, 'remove')}
                          </button>
                        </div>
                        <InviteCode
                          lang={lang}
                          isDarkMode={isDarkMode}
                          label=""
                          code={danceGroup.inviteCode ?? null}
                          empty={t(lang, 'organizer_after_create')}
                          onCopy={(_value, kind) => copyInvite(danceGroup.inviteCode ?? null, danceGroup.inviteCode ? shortInviteUrl(danceGroup.inviteCode) : '', kind)}
                        />
                        {campaign.dancers.length > 0 ? (
                          <AssignChips
                            people={peopleForTray(campaign.dancers, campaign.groups, danceGroup.id)}
                            fromGroupId={danceGroup.id}
                            isDarkMode={isDarkMode}
                          />
                        ) : null}
                      </AssignTarget>
                    </div>
                  ))}
                </div>
              </div>
            <div className={groupSurface('space-y-3')} data-organizer-block="" style={{ order: tab === 'organizers' ? 0 : 1 }}>
              <h3 className={`inline-flex items-center gap-2 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                {t(lang, 'choreographer')}
                <InfoTip lang={lang} name="organizer" text={t(lang, 'organizer_link_hint')} />
              </h3>
              <InviteCode
                lang={lang}
                isDarkMode={isDarkMode}
                label=""
                code={preferredInviteCode(campaign.organizerShort, campaign.organizerCode)}
                empty={t(lang, 'organizer_after_create')}
                onCopy={(_value, kind) =>
                  copyInvite(
                    preferredInviteCode(campaign.organizerShort, campaign.organizerCode),
                    preferredInviteLink(campaign.organizerShort, campaign.organizerCode, 'organizer'),
                    kind,
                  )
                }
              />
              {onOrganizerTime ? (
                <button type="button" data-role-time="organizer" onClick={onOrganizerTime} className="glass-well min-h-11 w-full rounded-full px-4 text-sm font-medium">
                  {t(lang, 'organizer_time')}
                </button>
              ) : null}
              <AssignRoleTarget role="organizer" ariaLabel={t(lang, 'choreographer')} hint={organizers.length === 0 ? t(lang, 'drop_here') : undefined}>
                {organizers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {organizers.map((person) => (
                      <span key={person.id} data-organizer-person={person.id} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${isDarkMode ? 'bg-white/10' : 'bg-black/[0.06]'}`}>
                        {person.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </AssignRoleTarget>
            </div>
            <div className={groupSurface('space-y-3')} data-admins-block="" style={{ order: tab === 'organizers' ? 1 : 2 }}>
              <h3 className={`inline-flex items-center gap-2 text-base font-semibold ${textPrimary(isDarkMode)}`}>
                {t(lang, 'admins_label')}
                <InfoTip lang={lang} name="admins" text={t(lang, 'invite_admin_hint')} />
              </h3>
              {campaign.adminShort || campaign.adminCode ? (
                <InviteCode
                  lang={lang}
                  isDarkMode={isDarkMode}
                  label=""
                  code={preferredInviteCode(campaign.adminShort, campaign.adminCode)}
                  empty={t(lang, 'invite_after_create')}
                  onCopy={(_value, kind) =>
                    copyInvite(
                      preferredInviteCode(campaign.adminShort, campaign.adminCode),
                      preferredInviteLink(campaign.adminShort, campaign.adminCode, 'admin'),
                      kind,
                    )
                  }
                />
              ) : null}
              {onAdminTime ? (
                <button type="button" data-role-time="admin" onClick={onAdminTime} className="glass-well min-h-11 w-full rounded-full px-4 text-sm font-medium">
                  {t(lang, 'admin_time')}
                </button>
              ) : null}
              <AssignRoleTarget role="admin" ariaLabel={t(lang, 'admins_label')} hint={campaign.admins.length === 0 ? t(lang, 'drop_here') : undefined}>
              {campaign.admins.map((admin) => (
                <div key={admin.id} className="glass-well flex items-center justify-between rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className={`truncate font-bold ${textPrimary(isDarkMode)}`}>{admin.email}</p>
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{t(lang, 'admin_joined')}</p>
                  </div>
                  {onRemoveAdmin ? (
                    <button type="button" onClick={() => onRemoveAdmin(admin.id)} className="text-sm font-bold text-[#f19ba8]">
                      {t(lang, 'remove')}
                    </button>
                  ) : null}
                </div>
              ))}
              </AssignRoleTarget>
            </div>
            </AssignBoard>
          </div>

          <section className={`${cardClass(isDarkMode)} space-y-4 rounded-[1.5rem] p-4 sm:p-5`}>
            <PeopleList
              lang={lang}
              isDarkMode={isDarkMode}
              title={t(lang, 'stats_responses')}
              ids={report.replied.map((person) => person.id)}
              names={new Map(report.replied.map((person) => [person.id, person.name]))}
              dancerById={dancerById}
              groups={campaign.groups}
            />
            <PeopleList
              lang={lang}
              isDarkMode={isDarkMode}
              title={t(lang, 'analysis_waiting')}
              ids={report.waiting.map((person) => person.id)}
              names={new Map(report.waiting.map((person) => [person.id, person.name]))}
              dancerById={dancerById}
              groups={campaign.groups}
            />
          </section>
        </div>
      ) : null}

      {tab === 'event' ? (
        <SetupPanel
          lang={lang}
          isDarkMode={isDarkMode}
          initial={campaign}
          readOnly={!canEditEvent}
          embedded
          showGroups={false}
          showInvites={false}
          onCancel={() => setTab('participants')}
          onConfirm={onSave}
          onRemoveAdmin={canEditEvent ? onRemoveAdmin : undefined}
        />
      ) : null}
    </div>
  )
}

function PeopleList({
  lang,
  isDarkMode,
  title,
  ids,
  names,
  dancerById,
  groups,
}: {
  lang: Language
  isDarkMode: boolean
  title: string
  ids: string[]
  names: Map<string, string>
  dancerById: Map<string, { id: string }>
  groups: Campaign['groups']
}) {
  return (
    <div className="space-y-2">
      <h3 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
        {title}
        <span className="ml-2 tabular-nums">{ids.length}</span>
      </h3>
      {ids.length === 0 ? <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'analysis_none')}</p> : null}
      {ids.map((id) => {
        if (!dancerById.has(id)) return null
        const memberOf = groups.filter((group) => group.memberIds.includes(id))
        return (
          <div key={id} className="flex min-w-0 items-baseline justify-between gap-3 py-1">
            <p className={`truncate text-sm font-bold ${textPrimary(isDarkMode)}`}>{names.get(id)}</p>
            {memberOf.length > 0 ? (
              <p className={`shrink-0 text-xs font-semibold ${textMuted(isDarkMode)}`}>{memberOf.map((group) => group.name).join(' · ')}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function GroupName({
  lang,
  isDarkMode,
  name,
  onRename,
}: {
  lang: Language
  isDarkMode: boolean
  name: string
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const assigning = useAssigning()
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        aria-label={t(lang, 'group_placeholder')}
        onBlur={(event) => {
          setEditing(false)
          if (event.target.value.trim() && event.target.value.trim() !== name) onRename(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setEditing(false)
        }}
        className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-bold ${inputClass(isDarkMode)}`}
      />
    )
  }
  return (
    <button
      type="button"
      data-assign-hit=""
      onClick={() => {
        if (assigning) return
        setEditing(true)
      }}
      className={`min-h-11 truncate text-left text-sm font-bold ${textPrimary(isDarkMode)}`}
    >
      {name}
    </button>
  )
}
