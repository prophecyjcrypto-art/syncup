import { useEffect, useState, type FormEvent } from 'react'
import { InfoTip } from './Guide'
import { formatPeopleCount, t } from '../i18n'
import { canManageRoster, isAdmin, isChoreographer, isOwner } from '../lib/access'
import { formatDate, isPast } from '../lib/dates'
import { preferredInviteCode, preferredInviteLink, shortInviteUrl } from '../lib/invites'
import { cardClass, groupSurface, inputClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
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
  onHub,
  onCopy,
  onJoinAdmin,
  initialOpenId = null,
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
  onHub: (campaign: Campaign) => void
  onCopy: (value: string, kind?: 'code' | 'link') => void
  onJoinAdmin: (value: string) => void
  initialOpenId?: string | null
}) {
  const [invite, setInvite] = useState('')
  const [openId, setOpenId] = useState<string | null>(initialOpenId)

  function submitInvite(event: FormEvent) {
    event.preventDefault()
    const value = invite.trim()
    if (!value) return
    onJoinAdmin(value)
    setInvite('')
  }

  const openCampaign = campaigns.find((campaign) => campaign.id === openId) ?? null
  const showDetail = openCampaign != null && canManageRoster(openCampaign, userId, email)

  useEffect(() => {
    if (!showDetail) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showDetail])

  const joinForm = (
    <form onSubmit={submitInvite} className={`${cardClass(isDarkMode)} mb-8 flex flex-col gap-3 rounded-[2rem] p-5 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1">
        <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${textPrimary(isDarkMode)}`}>
          {t(lang, 'join_admin')}
          <InfoTip lang={lang} name="join-admin" text={t(lang, 'join_code_hint')} />
        </p>
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
        <h2 className={`flex items-center justify-center gap-2 font-serif text-3xl font-semibold sm:text-4xl ${textPrimary(isDarkMode)}`}>
          {t(lang, 'no_active_projects')}
          <InfoTip lang={lang} name="events" text={t(lang, 'guide_events')} />
        </h2>
        <p className={`mt-3 ${textMuted(isDarkMode)}`}>{t(lang, 'create_project_desc')}</p>
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
            <InfoTip lang={lang} name="events" text={`${t(lang, 'guide_events')}\n${t(lang, 'tip_links')}`} />
          </h2>
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
          const people = campaign.choreographers.length + campaign.dancers.length
          return (
            <article key={campaign.id} data-event-card="" className={`${cardClass(isDarkMode)} glass-lift flex flex-col rounded-[1.75rem] p-6 text-left sm:p-7`}>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${expired ? 'bg-zinc-700 text-zinc-300' : 'bg-[#93ba8c]/20 text-[#93ba8c]'}`}>
                  {expired ? t(lang, 'expired') : t(lang, 'active')}
                </span>
                <span className="rounded-full bg-[#7c7bb9]/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#7c7bb9]">
                  {owner ? t(lang, 'owner') : admin ? t(lang, 'admin') : choreographer ? t(lang, 'choreographer') : t(lang, 'dancer')}
                </span>
              </div>
              <h3 className={`mt-5 font-serif text-2xl font-semibold leading-tight tracking-tight ${textPrimary(isDarkMode)}`}>
                {campaign.name}
              </h3>
              <p className="mt-1.5 text-sm text-zinc-400">{formatDate(new Date(campaign.createdAt), lang)}</p>
              <p className={`mt-6 text-[15px] leading-6 ${textMuted(isDarkMode)}`}>
                {formatPeopleCount(lang, people)}
                <span className="px-1.5 text-zinc-500">·</span>
                {t(lang, 'show_days_count', { n: campaign.onDays.length })}
                <span className="px-1.5 text-zinc-500">·</span>
                {t(lang, 'must_days_count', { n: campaign.compulsoryDays.length })}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {t(lang, 'deadline')}
                <span className="px-1.5 text-zinc-500">·</span>
                {formatDate(new Date(campaign.expiryDate), lang)}
              </p>
              <div className="mt-8 flex flex-col gap-3">
                {manager ? (
                  <button type="button" data-card-open="" onClick={() => setOpenId(campaign.id)} className={primaryButton('flex min-h-12 w-full items-center justify-center gap-2 px-5 text-[15px]')}>
                    {t(lang, 'card_manage')}
                    <span aria-hidden="true" className="text-lg leading-none">›</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => onPortal(campaign, 'dancer')} className={primaryButton('min-h-12 w-full px-5 text-[15px]')}>
                    {t(lang, 'enter_availability')}
                  </button>
                )}
                <button type="button" onClick={() => onResults(campaign)} className="glass-well min-h-12 w-full rounded-full px-5 text-[15px] font-medium">
                  {t(lang, 'view_results')}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {showDetail && openCampaign ? (
        <EventDetail
          lang={lang}
          isDarkMode={isDarkMode}
          campaign={openCampaign}
          userId={userId}
          email={email}
          onClose={() => setOpenId(null)}
          onOpen={onOpen}
          onDelete={onDelete}
          onChoreographers={onChoreographers}
          onDancers={onDancers}
          onPortal={onPortal}
          onHub={onHub}
          onCopy={onCopy}
        />
      ) : null}
    </div>
  )
}

function EventDetail({
  lang,
  isDarkMode,
  campaign,
  userId,
  email,
  onClose,
  onOpen,
  onDelete,
  onChoreographers,
  onDancers,
  onPortal,
  onHub,
  onCopy,
}: {
  lang: Language
  isDarkMode: boolean
  campaign: Campaign
  userId: string
  email: string
  onClose: () => void
  onOpen: (campaign: Campaign, mode: 'view' | 'edit') => void
  onDelete: (campaign: Campaign) => void
  onChoreographers: (campaign: Campaign) => void
  onDancers: (campaign: Campaign) => void
  onPortal: (campaign: Campaign, role: PersonRole) => void
  onHub: (campaign: Campaign) => void
  onCopy: (value: string, kind?: 'code' | 'link') => void
}) {
  const admin = isAdmin(campaign, userId, email)
  const choreographer = isChoreographer(campaign, userId)
  const participantCode = preferredInviteCode(campaign.participantShort, campaign.participantCode)
  const participantLink = preferredInviteLink(campaign.participantShort, campaign.participantCode, 'participant')
  const organizerLink = preferredInviteLink(campaign.organizerShort, campaign.organizerCode, 'organizer')
  const adminLink = preferredInviteLink(campaign.adminShort, campaign.adminCode, 'admin')
  const action = 'glass-well min-h-12 w-full rounded-full px-5 text-[15px] font-medium'
  const inviteCard = groupSurface('space-y-3')
  const inviteTitle = `text-[15px] font-semibold ${textPrimary(isDarkMode)}`
  const participantInvites = [
    {
      key: 'participant',
      heading: t(lang, 'all_participants'),
      code: participantCode,
      link: participantLink,
    },
    ...campaign.groups.map((group) => ({
      key: group.id,
      heading: group.name,
      code: group.inviteCode ?? null,
      link: group.inviteCode ? shortInviteUrl(group.inviteCode) : '',
    })),
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-md sm:items-center pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        data-card-detail=""
        className={`${cardClass(isDarkMode)} max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] p-6 text-left`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="event-detail-title" className={`font-serif text-2xl font-semibold leading-tight ${textPrimary(isDarkMode)}`}>
            {campaign.name}
          </h3>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl text-zinc-400" aria-label={t(lang, 'cancel')}>
            ×
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => onHub(campaign)} className={primaryButton('min-h-12 w-full px-5 text-[15px]')}>
            {t(lang, 'hub_open')}
          </button>
          {admin ? (
            <button type="button" onClick={() => onOpen(campaign, 'edit')} className={action}>
              {t(lang, 'edit_event')}
            </button>
          ) : null}
          <button type="button" onClick={() => onPortal(campaign, choreographer ? 'choreographer' : 'dancer')} className={action}>
            {t(lang, 'enter_availability')}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-1">
            <h4 className={`text-[15px] font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'participants_label')}</h4>
            <InfoTip lang={lang} name="card-invites" text={t(lang, 'card_invites_hint')} />
          </div>
          {participantInvites.map((invite) => (
            <section
              key={invite.key}
              data-invite={invite.key === 'participant' ? 'participant' : 'group'}
              data-group-id={invite.key === 'participant' ? undefined : invite.key}
              className={inviteCard}
            >
              <h5 className={inviteTitle}>{invite.heading}</h5>
              {invite.code ? (
                <p className={`font-mono text-[15px] font-medium tracking-[0.14em] ${invite.code.length > 8 ? 'break-all tracking-wide' : ''} ${textPrimary(isDarkMode)}`}>
                  {invite.code}
                </p>
              ) : (
                <p className={`text-sm ${textMuted(isDarkMode)}`}>{t(lang, 'organizer_after_create')}</p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={!invite.code} onClick={() => invite.code && onCopy(invite.code, 'code')} className={primaryButton('min-h-11 flex-1 px-4 text-sm disabled:opacity-40')}>
                  {t(lang, 'copy_code')}
                </button>
                <button type="button" disabled={!invite.link} onClick={() => invite.link && onCopy(invite.link, 'link')} className="glass-well min-h-11 flex-1 rounded-full px-4 text-sm font-medium disabled:opacity-40">
                  {t(lang, 'copy_short_link')}
                </button>
              </div>
            </section>
          ))}
          <section data-invite="organizer" className={inviteCard}>
            <h5 className={inviteTitle}>{t(lang, 'organizer_invite')}</h5>
            <button type="button" disabled={!organizerLink} onClick={() => organizerLink && onCopy(organizerLink, 'link')} className="glass-well min-h-11 w-full rounded-full px-4 text-sm font-medium disabled:opacity-40">
              {t(lang, 'copy_link_leader')}
            </button>
          </section>
          {admin && adminLink ? (
            <section data-invite="admin" className={inviteCard}>
              <h5 className={inviteTitle}>{t(lang, 'invite_admin')}</h5>
              <button type="button" onClick={() => onCopy(adminLink, 'link')} className="glass-well min-h-11 w-full rounded-full px-4 text-sm font-medium">
                {t(lang, 'copy_admin_link')}
              </button>
            </section>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 px-1">
          <button type="button" onClick={() => onChoreographers(campaign)} className={`min-h-11 text-sm font-medium ${textMuted(isDarkMode)}`}>
            {t(lang, 'manage_organizers')}
          </button>
          <button type="button" onClick={() => onDancers(campaign)} className={`min-h-11 text-sm font-medium ${textMuted(isDarkMode)}`}>
            {t(lang, 'manage_participants')}
          </button>
        </div>
        {admin ? (
          <button type="button" data-delete-event="" onClick={() => onDelete(campaign)} className="mt-4 min-h-11 w-full text-left text-sm font-medium text-[#f19ba8]">
            {t(lang, 'delete_event')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
