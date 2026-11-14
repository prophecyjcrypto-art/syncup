import { useMemo, useState, type FormEvent } from 'react'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
import { membershipChanges, peopleForTray } from '../lib/groups'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { cardClass, groupSurface, inputClass, textMuted, textPrimary } from '../lib/ui'
import type { Campaign, CampaignInput, Language } from '../types'
import { AnalysisPanel } from './AnalysisPanel'
import { AssignBoard, AssignChips, AssignTarget, AssignTray, useAssigning } from './GroupAssign'
import { InfoTip } from './Guide'
import { InviteCode } from './InviteCode'
import { SetupPanel } from './SetupPanel'

type HubTab = 'people' | 'settings' | 'stats'

export function OrganizerPortal({
  lang,
  isDarkMode,
  campaign,
  canEditEvent,
  initialTab = 'people',
  onBack,
  onSchedule,
  onCopy,
  onSave,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleMember,
  onRemoveAdmin,
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
}) {
  const [tab, setTab] = useState<HubTab>(initialTab)
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
  const tabs: { id: HubTab; label: string }[] = [
    { id: 'people', label: t(lang, 'hub_people') },
    { id: 'settings', label: t(lang, 'settings') },
    { id: 'stats', label: t(lang, 'tab_analysis') },
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" data-hub={tab}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
          ← {t(lang, 'back_home')}
        </button>
        <button type="button" onClick={onSchedule} className="min-h-11 rounded-full bg-[#7c7bb9] px-4 text-sm font-bold text-white">
          {t(lang, 'tab_schedule')}
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
      <div role="tablist" className="glass-well flex rounded-full p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-11 flex-1 rounded-full px-2 text-sm font-bold ${tab === item.id ? 'bg-[#7c7bb9] text-white' : textMuted(isDarkMode)}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'people' ? (
        <div className="space-y-4">
          <div className="space-y-3" data-codes-section="">
            <AssignBoard onMove={(personId, fromGroupId, toGroupId) => void moveDancer(personId, fromGroupId, toGroupId)}>
              <div className="space-y-3" data-participants-block="">
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
                    <button type="submit" disabled={!groupName.trim()} className="min-h-11 shrink-0 rounded-full bg-[#7c7bb9] px-4 text-sm font-bold text-white disabled:opacity-40">
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
            </AssignBoard>
            <div className={groupSurface('space-y-3')} data-organizer-block="">
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
            </div>
            <div className={groupSurface('space-y-3')} data-admins-block="">
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
              {(campaign.admins.length ?? 0) === 0 ? <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'admins_empty')}</p> : null}
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
            </div>
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

      {tab === 'settings' ? (
        <SetupPanel
          lang={lang}
          isDarkMode={isDarkMode}
          initial={campaign}
          readOnly={!canEditEvent}
          embedded
          showGroups={false}
          showInvites={false}
          onCancel={() => setTab('people')}
          onConfirm={onSave}
          onRemoveAdmin={canEditEvent ? onRemoveAdmin : undefined}
        />
      ) : null}

      {tab === 'stats' ? <AnalysisPanel lang={lang} isDarkMode campaign={campaign} sessions={[]} /> : null}
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
