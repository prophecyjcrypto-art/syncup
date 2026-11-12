import { useState, type FormEvent } from 'react'
import { GuideNote, InfoTip } from './Guide'
import { t } from '../i18n'
import { canManageRoster, isAdmin, isChoreographer, isOwner } from '../lib/access'
import { formatDate, isPast } from '../lib/dates'
import { adminInviteUrl, organizerInviteUrl, participantInviteUrl } from '../lib/invites'
import { cardClass, inputClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import type { Campaign, Language, PersonRole } from '../types'

export function CampaignList({
  lang,
  isDarkMode,
  campaigns,
  userId,
  email,
  onCreate,
  onOpen,
  onDelete,
  onChoreographers,
  onDancers,
  onResults,
  onPortal,
  onCopy,
  onJoinAdmin,
}: {
  lang: Language
  isDarkMode: boolean
  campaigns: Campaign[]
  userId: string
  email: string
  onCreate: () => void
  onOpen: (campaign: Campaign, mode: 'view' | 'edit') => void
  onDelete: (campaign: Campaign) => void
  onChoreographers: (campaign: Campaign) => void
  onDancers: (campaign: Campaign) => void
  onResults: (campaign: Campaign) => void
  onPortal: (campaign: Campaign, role: PersonRole) => void
  onCopy: (url: string) => void
  onJoinAdmin: (value: string) => void
}) {
  const [invite, setInvite] = useState('')

  function submitInvite(event: FormEvent) {
    event.preventDefault()
    const value = invite.trim()
    if (!value) return
    onJoinAdmin(value)
    setInvite('')
  }

  const joinForm = (
    <form onSubmit={submitInvite} className={`${cardClass(isDarkMode)} mb-8 flex flex-col gap-3 rounded-[2rem] p-5 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'join_admin')}</p>
        <p className={`mt-1 text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'invite_admin_hint')}</p>
      </div>
      <input
        value={invite}
        onChange={(event) => setInvite(event.target.value)}
        placeholder={t(lang, 'join_admin_placeholder')}
        className={`w-full rounded-xl px-4 py-3 sm:max-w-xs ${inputClass(isDarkMode)}`}
      />
      <button type="submit" className={primaryButton('shrink-0 px-5 py-3 text-sm')}>
        {t(lang, 'join_admin')}
      </button>
    </form>
  )

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {joinForm}
      <div className={`${cardClass(isDarkMode)} rounded-[2rem] px-8 py-16 text-center`}>
        <img src="/logo.png" alt="" className="mx-auto mb-6 h-20 w-20 object-contain" />
        <h2 className={`font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>{t(lang, 'no_active_projects')}</h2>
        <p className={`mt-3 ${textMuted(isDarkMode)}`}>{t(lang, 'create_project_desc')}</p>
        <p className={`mx-auto mt-6 max-w-md text-sm leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'guide_events')}</p>
        <button type="button" onClick={onCreate} className={primaryButton('mt-8 px-8 py-3')}>
          {t(lang, 'create_first_project')}
        </button>
      </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`inline-flex items-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
            {t(lang, 'campaigns')}
            <InfoTip lang={lang} text={t(lang, 'tip_links')} />
          </h2>
          <GuideNote>{t(lang, 'guide_events')}</GuideNote>
        </div>
        <button type="button" onClick={onCreate} className={primaryButton('min-h-11 w-full shrink-0 px-6 py-3 text-sm sm:w-auto')}>
          + {t(lang, 'new_campaign')}
        </button>
      </div>
      {joinForm}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const owner = isOwner(campaign, userId)
          const admin = isAdmin(campaign, userId, email)
          const choreographer = isChoreographer(campaign, userId)
          const manager = canManageRoster(campaign, userId, email)
          const expired = isPast(campaign.expiryDate)
          const participantLink = campaign.participantCode ? participantInviteUrl(campaign.participantCode) : ''
          return (
            <article key={campaign.id} className={`${cardClass(isDarkMode)} glass-lift flex flex-col rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${expired ? 'bg-zinc-700 text-zinc-300' : 'bg-[#93ba8c]/20 text-[#93ba8c]'}`}>
                    {expired ? t(lang, 'expired') : t(lang, 'active')}
                  </span>
                  <span className="rounded-full bg-[#7c7bb9]/20 px-3 py-1 text-[10px] font-bold uppercase text-[#7c7bb9]">
                    {owner ? t(lang, 'owner') : admin ? t(lang, 'admin') : choreographer ? t(lang, 'choreographer') : t(lang, 'dancer')}
                  </span>
                </div>
                <div className="flex gap-2">
                  {admin && (
                    <button type="button" onClick={() => onOpen(campaign, 'edit')} aria-label={t(lang, 'edit_event')} className="flex h-11 w-11 items-center justify-center">
                      ✎
                    </button>
                  )}
                  {owner && (
                    <button type="button" className="flex h-11 w-11 items-center justify-center text-xl text-zinc-400 hover:text-[#f19ba8]" onClick={() => onDelete(campaign)} aria-label={t(lang, 'delete_confirm')}>
                      ×
                    </button>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => onOpen(campaign, admin ? 'edit' : 'view')} className={`text-left font-serif text-2xl ${textPrimary(isDarkMode)}`}>
                {campaign.name}
              </button>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                {formatDate(new Date(campaign.createdAt), lang)}
              </p>
              <p className={`mt-4 text-sm ${textMuted(isDarkMode)}`}>
                {campaign.choreographers.length + campaign.dancers.length} {t(lang, 'submissions')}
                {' · '}
                {t(lang, 'show_days_count', { n: campaign.onDays.length })}
                {' · '}
                {t(lang, 'must_days_count', { n: campaign.compulsoryDays.length })}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t(lang, 'deadline')} {formatDate(new Date(campaign.expiryDate), lang)}
              </p>
              <div className="mt-6 space-y-2">
                {manager ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => onChoreographers(campaign)} className="rounded-2xl bg-[#f6cf7a] py-3 text-xs font-bold text-zinc-900">
                        {t(lang, 'manage_leadership')}
                      </button>
                      <button type="button" onClick={() => onDancers(campaign)} className="btn-glow rounded-2xl bg-[#7c7bb9] py-3 text-xs font-bold text-white">
                        {t(lang, 'manage_members')}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!campaign.organizerCode}
                        onClick={() => campaign.organizerCode && onCopy(organizerInviteUrl(campaign.organizerCode))}
                        className="rounded-xl border border-[#f6cf7a]/50 py-2 text-xs font-medium text-[#f6cf7a] disabled:opacity-40"
                      >
                        {t(lang, 'copy_link_leader')}
                      </button>
                      <button
                        type="button"
                        disabled={!participantLink}
                        onClick={() => participantLink && onCopy(participantLink)}
                        className="rounded-xl border border-[#7c7bb9]/50 py-2 text-xs font-medium text-[#7c7bb9] disabled:opacity-40"
                      >
                        {t(lang, 'copy_link_dancer')}
                      </button>
                    </div>
                    {admin && campaign.adminCode && (
                      <button type="button" onClick={() => onCopy(adminInviteUrl(campaign.adminCode!))} className="glass-well w-full rounded-xl py-2 text-xs font-medium">
                        {t(lang, 'copy_invite')}
                      </button>
                    )}
                    <button type="button" onClick={() => onResults(campaign)} className="glass-well w-full rounded-xl py-3 text-sm font-medium">
                      {t(lang, 'view_results')}
                    </button>
                    <button type="button" onClick={() => onPortal(campaign, choreographer ? 'choreographer' : 'dancer')} className={`w-full text-sm ${textMuted(isDarkMode)}`}>
                      {t(lang, 'enter_availability')}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onResults(campaign)} className="glass-well w-full rounded-xl py-3 text-sm font-medium">
                      {t(lang, 'view_results')}
                    </button>
                    <button type="button" onClick={() => onPortal(campaign, 'dancer')} className="btn-glow w-full rounded-2xl bg-[#7c7bb9] py-3 text-sm font-bold text-white">
                      {t(lang, 'enter_availability')}
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
