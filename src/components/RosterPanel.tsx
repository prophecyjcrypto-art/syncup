import { useState } from 'react'
import { AvailabilityEditor } from './AvailabilityEditor'
import { t } from '../i18n'
import { formatBlockLabel } from '../lib/blocks'
import { formatDate, formatLongDate, parseISODate } from '../lib/dates'
import { uncoveredDays } from '../lib/schedule'
import { cardClass, inputClass, textMuted, textPrimary } from '../lib/ui'
import { GuideNote } from './Guide'
import type { Campaign, Language, PersonRole, TimeBlock } from '../types'

export function RosterPanel({
  lang,
  isDarkMode,
  campaign,
  variant,
  onBack,
  onNext,
  onSave,
  onDelete,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  variant: PersonRole
  onBack: () => void
  onNext: () => void
  onSave: (input: { personId?: string; name: string; role: PersonRole; blocks: TimeBlock[] }) => Promise<boolean>
  onDelete: (personId: string) => Promise<void>
}) {
  const people = variant === 'choreographer' ? campaign.choreographers : campaign.dancers
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <button type="button" onClick={onBack} className={`text-xs font-bold uppercase ${textMuted(isDarkMode)}`}>
        ← {t(lang, 'campaigns')}
      </button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
            {variant === 'choreographer' ? t(lang, 'roster_header_leadership') : t(lang, 'roster_header_members')}
          </h2>
          <GuideNote>{variant === 'choreographer' ? t(lang, 'guide_choreo') : t(lang, 'guide_dancers')}</GuideNote>
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
        {people.length === 0 ? (
          <p className={`md:col-span-2 py-10 text-center text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'empty_people')}</p>
        ) : (
          people.map((person) => (
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
              <div className="space-y-1">
                {person.blocks.length === 0 ? (
                  <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'no_times')}</p>
                ) : (
                  person.blocks.slice(0, 6).map((block) => (
                    <p key={block.id} className={`text-xs ${textMuted(isDarkMode)}`}>
                      <span className={block.kind === 'available' ? 'text-[#93ba8c]' : 'text-[#f19ba8]'}>
                        {block.kind === 'available' ? t(lang, 'mode_available') : t(lang, 'mode_unavailable')}
                      </span>
                      {' · '}
                      {formatBlockLabel(block, lang, t(lang, 'whole_day'))}
                    </p>
                  ))
                )}
                {person.blocks.length > 6 && <p className="text-xs text-zinc-400">+{person.blocks.length - 6}</p>}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
