import { useState } from 'react'
import { AvailabilityEditor } from './AvailabilityEditor'
import { t } from '../i18n'
import { formatLongDate, isPast, parseISODate } from '../lib/dates'
import { incompleteCompulsoryDays, uncoveredDays } from '../lib/schedule'
import { inputClass, textMuted, textPrimary } from '../lib/ui'
import { GuideNote } from './Guide'
import type { Campaign, Language, PersonRole, TimeBlock } from '../types'

export function DancerPortal({
  lang,
  isDarkMode,
  campaign,
  userId,
  email,
  linkRole,
  onBack,
  onSave,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  userId: string
  email: string
  linkRole: PersonRole
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
          <h2 className={`font-serif text-4xl font-semibold ${textPrimary(isDarkMode)}`}>{campaign.name}</h2>
          <p className={`mt-2 text-sm ${textMuted(isDarkMode)}`}>
            {role === 'choreographer' ? t(lang, 'choreographer') : t(lang, 'dancer')} · {email}
          </p>
          <GuideNote>{t(lang, 'guide_portal')}</GuideNote>
        </div>
        <p className={`rounded-full px-4 py-2 text-xs font-bold uppercase ${locked ? 'bg-zinc-700 text-zinc-300' : 'bg-[#7c7bb9] text-white'}`}>
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
      <label className="block max-w-md space-y-2">
        <span className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{t(lang, 'member_name')}</span>
        <input
          value={name}
          disabled={locked}
          onChange={(event) => setName(event.target.value)}
          className={`w-full rounded-2xl px-4 py-3 font-bold ${inputClass(isDarkMode)}`}
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
      />
      {!locked && (
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full btn-glow bg-[#7c7bb9] px-8 py-3 font-bold text-white disabled:opacity-40">
          {saved && !busy ? t(lang, 'saved_ok') : busy ? t(lang, 'loading') : t(lang, 'sync_changes')}
        </button>
      )}
    </div>
  )
}
