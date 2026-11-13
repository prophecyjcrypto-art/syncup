import { useState, type FormEvent } from 'react'
import { AvailabilityEditor } from './AvailabilityEditor'
import { MarkFilterControl } from './MarkFilter'
import { t } from '../i18n'
import { formatBlockLabel } from '../lib/blocks'
import { formatDate, formatLongDate, parseISODate } from '../lib/dates'
import { shortInviteUrl } from '../lib/invites'
import { uncoveredDays } from '../lib/schedule'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import { InviteCode } from './InviteCode'
import type { MarkFilter } from '../lib/schedule'
import type { Campaign, DanceGroup, Language, PersonRole, TimeBlock } from '../types'

export function RosterPanel({
  lang,
  isDarkMode,
  campaign,
  variant,
  onBack,
  onNext,
  onSave,
  onDelete,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleMember,
  onCopy,
  onRotateGroup,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  variant: PersonRole
  onBack: () => void
  onNext: () => void
  onSave: (input: { personId?: string; name: string; role: PersonRole; blocks: TimeBlock[] }) => Promise<boolean>
  onDelete: (personId: string) => Promise<void>
  onCreateGroup?: (name: string) => Promise<boolean>
  onRenameGroup?: (groupId: string, name: string) => Promise<boolean>
  onDeleteGroup?: (groupId: string) => Promise<boolean>
  onToggleMember?: (groupId: string, personId: string, included: boolean) => Promise<boolean>
  onCopy?: (value: string, kind: 'code' | 'link') => void
  onRotateGroup?: (groupId: string) => Promise<boolean>
}) {
  const people = variant === 'choreographer' ? campaign.choreographers : campaign.dancers
  const groups = variant === 'dancer' ? campaign.groups : []
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [markFilter, setMarkFilter] = useState<MarkFilter>('both')
  const accent = variant === 'choreographer' ? 'bg-[#f6cf7a] text-zinc-900' : 'bg-[#7c7bb9] text-white'

  async function save() {
    if (!name.trim()) return
    const missing = uncoveredDays(campaign.config, blocks)
    if (missing.length) {
      const days = missing.map((iso) => formatLongDate(parseISODate(iso), lang)).join(', ')
      window.alert(t(lang, 'mixed_incomplete', { days }))
      return
    }
    setBusy(true)
    try {
      const ok = await onSave({ personId: editingId ?? undefined, name, role: variant, blocks })
      if (!ok) return
      setName('')
      setBlocks([])
      setEditingId(null)
    } finally {
      setBusy(false)
    }
  }

  const shown = people.filter((person) => {
    if (!groupId) return true
    return groups.find((group) => group.id === groupId)?.memberIds.includes(person.id) ?? false
  })

  async function addGroup(event: FormEvent) {
    event.preventDefault()
    const trimmed = groupName.trim()
    if (!trimmed || !onCreateGroup) return
    const ok = await onCreateGroup(trimmed)
    if (ok) setGroupName('')
  }

  function visibleBlocks(blocks: TimeBlock[]): TimeBlock[] {
    if (markFilter === 'na') return blocks.filter((block) => block.kind === 'unavailable')
    if (markFilter === 'ok') return blocks.filter((block) => block.kind === 'available')
    return blocks
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
        ← {t(lang, 'campaigns')}
      </button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`inline-flex flex-wrap items-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
            {variant === 'choreographer' ? t(lang, 'roster_header_leadership') : t(lang, 'roster_header_members')}
            <InfoTip lang={lang} name="roster" text={variant === 'choreographer' ? t(lang, 'guide_choreo') : t(lang, 'guide_dancers')} />
          </h2>
        </div>
        <button type="button" onClick={onNext} className={`min-h-11 w-full rounded-full px-6 py-3 text-sm font-bold sm:w-auto ${accent}`}>
          {variant === 'choreographer' ? t(lang, 'next_dancers') : t(lang, 'view_results')}
        </button>
      </div>
      {editingId && (
        <p className="text-sm font-bold text-[#f6cf7a]">
          {t(lang, 'editing', { name })}
          <button type="button" className="ml-3 underline" onClick={() => { setEditingId(null); setName(''); setBlocks([]) }}>
            {t(lang, 'cancel_edit')}
          </button>
        </p>
      )}
      {variant === 'dancer' && onCreateGroup ? (
        <section className="space-y-3">
          <h3 className={`inline-flex items-center gap-2 text-sm font-bold ${textPrimary(isDarkMode)}`}>
            {t(lang, 'groups_label')}
            <InfoTip lang={lang} name="groups" text={t(lang, 'guide_groups')} />
          </h3>
          <form onSubmit={(event) => void addGroup(event)} className="flex max-w-md gap-2">
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder={t(lang, 'groups_label')}
              aria-label={t(lang, 'groups_label')}
              className={`min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}
            />
            <button type="submit" disabled={!groupName.trim()} className="min-h-11 shrink-0 rounded-full bg-[#7c7bb9] px-4 text-xs font-bold text-white disabled:opacity-40">
              {t(lang, 'add_admin')}
            </button>
          </form>
          {groups.length > 0 ? (
            <div className="chip-row py-1">
              <button
                type="button"
                data-group-id="all"
                aria-pressed={groupId === null}
                onClick={() => setGroupId(null)}
                className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${groupId === null ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}
              >
                {t(lang, 'filter_all')}
              </button>
              {groups.map((group) => (
                <GroupChip
                  key={group.id}
                  group={group}
                  selected={groupId === group.id}
                  renaming={renamingId === group.id}
                  isDarkMode={isDarkMode}
                  onSelect={() => {
                    if (groupId === group.id) setRenamingId(group.id)
                    else setGroupId(group.id)
                  }}
                  onRename={async (next) => {
                    setRenamingId(null)
                    if (next.trim() && next.trim() !== group.name && onRenameGroup) await onRenameGroup(group.id, next)
                  }}
                  onDelete={() => {
                    if (!onDeleteGroup || !window.confirm(t(lang, 'delete_group'))) return
                    if (groupId === group.id) setGroupId(null)
                    void onDeleteGroup(group.id)
                  }}
                />
              ))}
            </div>
          ) : null}
          {groupId && onCopy ? (
            <InviteCode
              lang={lang}
              isDarkMode={isDarkMode}
              label=""
              hint={t(lang, 'group_code_hint')}
              code={groups.find((group) => group.id === groupId)?.inviteCode ?? null}
              empty={t(lang, 'organizer_after_create')}
              onCopy={(_value, kind) => {
                const code = groups.find((group) => group.id === groupId)?.inviteCode
                if (!code) return
                onCopy(kind === 'link' ? shortInviteUrl(code) : code, kind)
              }}
              onRotate={onRotateGroup ? () => void onRotateGroup(groupId) : undefined}
            />
          ) : null}
          <MarkFilterControl lang={lang} value={markFilter} onChange={setMarkFilter} />
        </section>
      ) : null}
      <label className="block max-w-md space-y-2">
        <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'member_name')}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className={`w-full rounded-2xl px-4 py-3 font-bold ${inputClass(isDarkMode)}`} />
      </label>
      <AvailabilityEditor
        lang={lang}
        isDarkMode={isDarkMode}
        config={campaign.config}
        onDays={campaign.onDays}
        compulsoryDays={campaign.compulsoryDays}
        blocks={blocks}
        onChange={setBlocks}
      />
      <div className="dock">
      <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="min-h-11 w-full rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white disabled:opacity-40 sm:w-auto">
        {busy ? t(lang, 'loading') : t(lang, 'save_member')}
      </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {shown.length === 0 ? (
          <p className={`md:col-span-2 py-10 text-center text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'list_empty')}</p>
        ) : (
          shown.map((person) => (
            <article key={person.id} className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-5`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className={`font-bold ${textPrimary(isDarkMode)}`}>{person.name}</h3>
                  {person.lastUpdated && (
                    <p className="text-[10px] font-bold uppercase text-zinc-400">
                      {t(lang, 'refreshed')} {formatDate(new Date(person.lastUpdated), lang)}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(person.id)
                      setName(person.name)
                      setBlocks(person.blocks)
                    }}
                  >
                    {t(lang, 'edit_event')}
                  </button>
                  <button
                    type="button"
                    className="text-[#f19ba8]"
                    onClick={() => {
                      if (window.confirm(t(lang, 'delete_person'))) void onDelete(person.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {groups.length > 0 && onToggleMember ? (
                <div className="chip-row mb-3 py-1">
                  {groups.map((group) => {
                    const on = group.memberIds.includes(person.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        data-assign-group={group.id}
                        aria-pressed={on}
                        onClick={() => void onToggleMember(group.id, person.id, !on)}
                        className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-bold ${on ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}
                      >
                        {group.name}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className="space-y-1">
                {visibleBlocks(person.blocks).length === 0 ? (
                  <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_times')}</p>
                ) : (
                  visibleBlocks(person.blocks).slice(0, 6).map((block) => (
                    <p key={block.id} className={`text-xs ${textMuted(isDarkMode)}`}>
                      <span className={block.kind === 'available' ? 'text-[#93ba8c]' : 'text-[#f19ba8]'}>
                        {block.kind === 'available' ? t(lang, 'mode_available') : t(lang, 'mode_unavailable')}
                      </span>
                      {' · '}
                      {formatBlockLabel(block, lang, t(lang, 'whole_day'))}
                    </p>
                  ))
                )}
                {visibleBlocks(person.blocks).length > 6 && <p className="text-xs text-zinc-400">+{visibleBlocks(person.blocks).length - 6}</p>}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function GroupChip({
  group,
  selected,
  renaming,
  isDarkMode,
  onSelect,
  onRename,
  onDelete,
}: {
  group: DanceGroup
  selected: boolean
  renaming: boolean
  isDarkMode: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={group.name}
        aria-label={group.name}
        onBlur={(event) => onRename(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') onRename(group.name)
        }}
        className={`min-h-11 w-28 rounded-full px-3 text-xs font-bold ${inputClass(isDarkMode)}`}
      />
    )
  }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full ${selected ? 'bg-[#7c7bb9] text-white' : 'glass-well'}`}>
      <button type="button" data-group-id={group.id} aria-pressed={selected} onClick={onSelect} className="min-h-11 px-3 text-xs font-bold">
        {group.name}
      </button>
      <button type="button" onClick={onDelete} className="min-h-11 pr-3 text-xs font-bold" aria-label="×">
        ×
      </button>
    </span>
  )
}
