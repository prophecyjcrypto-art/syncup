import { useMemo, useState, type FormEvent } from 'react'
import { t } from '../i18n'
import { analyzeEvent } from '../lib/analysis'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import type { Campaign, CampaignInput, Language } from '../types'
import { AnalysisPanel } from './AnalysisPanel'
import { InfoTip } from './Guide'
import { InviteCode } from './InviteCode'
import { SetupPanel } from './SetupPanel'

type HubTab = 'people' | 'settings' | 'stats'

export function OrganizerPortal({
  lang,
  isDarkMode,
  campaign,
  canEditEvent,
  canRotateEvent,
  initialTab = 'people',
  onBack,
  onSchedule,
  onCopy,
  onSave,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleMember,
  onRotateAdmin,
  onRotateOrganizer,
  onRotateParticipant,
  onRotateGroup,
  onRemoveAdmin,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  canEditEvent: boolean
  canRotateEvent: boolean
  initialTab?: HubTab
  onBack: () => void
  onSchedule: () => void
  onCopy: (value: string, kind: 'code' | 'link') => void
  onSave: (input: CampaignInput) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDeleteGroup: (groupId: string) => void
  onToggleMember: (groupId: string, personId: string, included: boolean) => void
  onRotateAdmin?: () => void
  onRotateOrganizer?: () => void
  onRotateParticipant?: () => void
  onRotateGroup?: (groupId: string) => void
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
          <section className={`${cardClass(isDarkMode)} space-y-4 rounded-[1.5rem] p-4 sm:p-5`}>
            <PeopleList
              lang={lang}
              isDarkMode={isDarkMode}
              title={t(lang, 'stats_responses')}
              ids={report.replied.map((person) => person.id)}
              names={new Map(report.replied.map((person) => [person.id, person.name]))}
              dancerById={dancerById}
              groups={campaign.groups}
              onToggleMember={onToggleMember}
            />
            <PeopleList
              lang={lang}
              isDarkMode={isDarkMode}
              title={t(lang, 'analysis_waiting')}
              ids={report.waiting.map((person) => person.id)}
              names={new Map(report.waiting.map((person) => [person.id, person.name]))}
              dancerById={dancerById}
              groups={campaign.groups}
              onToggleMember={onToggleMember}
            />
          </section>

          <section className={`${cardClass(isDarkMode)} space-y-4 rounded-[1.5rem] p-4 sm:p-5`}>
            <h3 className={`inline-flex items-center gap-2 font-serif text-2xl ${textPrimary(isDarkMode)}`}>
              {t(lang, 'groups_label')}
              <InfoTip lang={lang} name="groups" text={t(lang, 'group_code_hint')} />
            </h3>
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
            {campaign.groups.length === 0 ? <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_groups')}</p> : null}
            {campaign.groups.map((group) => (
              <div key={group.id} className="space-y-2 border-t border-white/10 pt-4" data-group-id={group.id}>
                <div className="flex items-center justify-between gap-3">
                  <GroupName lang={lang} isDarkMode={isDarkMode} name={group.name} onRename={(name) => onRenameGroup(group.id, name)} />
                  <button
                    type="button"
                    className="text-sm font-bold text-[#f19ba8]"
                    onClick={() => {
                      if (window.confirm(t(lang, 'delete_group'))) onDeleteGroup(group.id)
                    }}
                  >
                    {t(lang, 'remove')}
                  </button>
                </div>
                <InviteCode
                  lang={lang}
                  isDarkMode={isDarkMode}
                  label=""
                  code={group.inviteCode ?? null}
                  empty={t(lang, 'organizer_after_create')}
                  onCopy={(_value, kind) => copyInvite(group.inviteCode ?? null, group.inviteCode ? shortInviteUrl(group.inviteCode) : '', kind)}
                  onRotate={onRotateGroup ? () => onRotateGroup(group.id) : undefined}
                />
              </div>
            ))}
          </section>

          <section className={`${cardClass(isDarkMode)} space-y-5 rounded-[1.5rem] p-4 sm:p-5`}>
            <h3 className={`inline-flex items-center gap-2 font-serif text-2xl ${textPrimary(isDarkMode)}`}>
              {t(lang, 'organizer_link')}
              <InfoTip lang={lang} name="links" text={t(lang, 'organizer_link_hint')} />
            </h3>
            <InviteCode
              lang={lang}
              isDarkMode={isDarkMode}
              label={t(lang, 'dancer')}
              code={preferredInviteCode(campaign.participantShort, campaign.participantCode)}
              empty={t(lang, 'organizer_after_create')}
              readOnly={!canRotateEvent}
              onCopy={(_value, kind) =>
                copyInvite(
                  preferredInviteCode(campaign.participantShort, campaign.participantCode),
                  preferredInviteLink(campaign.participantShort, campaign.participantCode, 'participant'),
                  kind,
                )
              }
              onRotate={canRotateEvent ? onRotateParticipant : undefined}
            />
            <InviteCode
              lang={lang}
              isDarkMode={isDarkMode}
              label={t(lang, 'choreographer')}
              code={preferredInviteCode(campaign.organizerShort, campaign.organizerCode)}
              empty={t(lang, 'organizer_after_create')}
              readOnly={!canRotateEvent}
              onCopy={(_value, kind) =>
                copyInvite(
                  preferredInviteCode(campaign.organizerShort, campaign.organizerCode),
                  preferredInviteLink(campaign.organizerShort, campaign.organizerCode, 'organizer'),
                  kind,
                )
              }
              onRotate={canRotateEvent ? onRotateOrganizer : undefined}
            />
            {canRotateEvent || campaign.adminShort || campaign.adminCode ? (
              <InviteCode
                lang={lang}
                isDarkMode={isDarkMode}
                label={t(lang, 'admin')}
                hint={t(lang, 'invite_admin_hint')}
                code={preferredInviteCode(campaign.adminShort, campaign.adminCode)}
                empty={t(lang, 'invite_after_create')}
                readOnly={!canRotateEvent}
                onCopy={(_value, kind) =>
                  copyInvite(
                    preferredInviteCode(campaign.adminShort, campaign.adminCode),
                    preferredInviteLink(campaign.adminShort, campaign.adminCode, 'admin'),
                    kind,
                  )
                }
                onRotate={canRotateEvent ? onRotateAdmin : undefined}
              />
            ) : null}
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
  onToggleMember,
}: {
  lang: Language
  isDarkMode: boolean
  title: string
  ids: string[]
  names: Map<string, string>
  dancerById: Map<string, { id: string }>
  groups: Campaign['groups']
  onToggleMember: (groupId: string, personId: string, included: boolean) => void
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
        return (
          <div key={id} className="min-w-0 py-1" data-person-id={id}>
            <p className={`truncate text-sm font-bold ${textPrimary(isDarkMode)}`}>{names.get(id)}</p>
            {groups.length > 0 ? (
              <div className="chip-row py-1">
                {groups.map((group) => {
                  const on = group.memberIds.includes(id)
                  return (
                    <button
                      key={group.id}
                      type="button"
                      data-assign-group={group.id}
                      aria-pressed={on}
                      onClick={() => onToggleMember(group.id, id, !on)}
                      className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${on ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}
                    >
                      {group.name}
                    </button>
                  )
                })}
              </div>
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
    <button type="button" onClick={() => setEditing(true)} className={`truncate text-left text-sm font-bold ${textPrimary(isDarkMode)}`}>
      {name}
    </button>
  )
}
