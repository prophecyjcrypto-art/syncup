import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { CampaignList } from './components/CampaignList'
import { DancerPortal } from './components/DancerPortal'
import { FlowSteps, type FlowStep } from './components/Guide'
import { Landing } from './components/Landing'
import { ResultsPanel } from './components/ResultsPanel'
import { RosterPanel } from './components/RosterPanel'
import { SetupPanel } from './components/SetupPanel'
import { LANGUAGES, t } from './i18n'
import { canManageRoster, isAdmin, isChoreographer } from './lib/access'
import {
  claimAdminInvite,
  claimAdminInvites,
  claimOrganizerInvite,
  claimParticipantInvite,
  createCampaign,
  deleteCampaign,
  deletePerson,
  campaignVisible,
  fetchCampaigns,
  InviteError,
  removeAdmin,
  rotateAdminInvite,
  rotateOrganizerInvite,
  rotateParticipantInvite,
  savePortalPerson,
  saveRosterPerson,
  setSavedSlots,
  updateCampaign,
} from './lib/db'
import { parseAdminInvite, parseOrganizerInvite, parseParticipantInvite } from './lib/invites'
import {
  captureGoogleSession,
  clearGoogleToken,
  GOOGLE_CALENDAR_ENABLED,
  GOOGLE_CALENDAR_SCOPES,
  readGoogleToken,
} from './lib/googleCalendar'
import { CalendarProvider } from './lib/calendarContext'
import { supabase, supabaseConfigError } from './lib/supabase'
import { cardClass, inputClass, primaryButton, textMuted, textPrimary } from './lib/ui'
import type { AppStep, Campaign, CampaignInput, Language, PersonRole } from './types'

interface SessionUser {
  id: string
  email: string
}

function toSession(user: User | null | undefined): SessionUser | null {
  if (!user) return null
  return { id: user.id, email: (user.email ?? '').toLowerCase() }
}

function readRole(value: string | null): PersonRole | null {
  if (value === 'participant' || value === 'dancer') return 'dancer'
  if (value === 'organizer' || value === 'choreographer' || value === 'leader') return 'choreographer'
  return null
}

function readUrl(): {
  campaign: string | null
  role: PersonRole | null
  admin: string | null
  organizer: string | null
  participant: string | null
} {
  const params = new URLSearchParams(window.location.search)
  return {
    campaign: params.get('campaign'),
    role: readRole(params.get('role')),
    admin: params.get('admin'),
    organizer: params.get('organizer'),
    participant: params.get('participant'),
  }
}

function replaceSearch(mutate: (params: URLSearchParams) => void) {
  const next = new URL(window.location.href)
  mutate(next.searchParams)
  const search = next.searchParams.toString()
  window.history.replaceState({}, '', `${next.pathname}${search ? `?${search}` : ''}${next.hash}`)
}

function clearAdminParam() {
  replaceSearch((params) => params.delete('admin'))
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('hupaak-lang') === 'zh' ? 'zh' : 'en'))
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('hupaak-dark') !== '0')
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<AppStep>('login')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Campaign | undefined>(undefined)
  const [readOnly, setReadOnly] = useState(false)
  const [portalRole, setPortalRole] = useState<PersonRole>('dancer')
  const [urlState, setUrlState] = useState(readUrl)
  const [banner, setBanner] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [linkMissing, setLinkMissing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authNote, setAuthNote] = useState('')
  const [googleToken, setGoogleToken] = useState<string | null>(() => (GOOGLE_CALENDAR_ENABLED ? readGoogleToken() : null))
  const [calendarNote, setCalendarNote] = useState('')
  const didRoute = useRef(false)
  const hasLoaded = useRef(false)
  const reloadRef = useRef<() => Promise<void>>(async () => {})
  const active = campaigns.find((campaign) => campaign.id === activeId)

  useEffect(() => {
    localStorage.setItem('hupaak-lang', lang)
  }, [lang])

  useEffect(() => {
    localStorage.setItem('hupaak-dark', isDarkMode ? '1' : '0')
  }, [isDarkMode])

  useEffect(() => {
    if (!ready || user) return
    if (urlState.organizer) setBanner(t(lang, 'organizer_sign_in'))
    else if (urlState.participant) setBanner(t(lang, 'participant_sign_in'))
    else if (urlState.admin) setBanner(t(lang, 'invite_sign_in'))
  }, [ready, user, urlState.admin, urlState.organizer, urlState.participant, lang])

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (GOOGLE_CALENDAR_ENABLED) {
        captureGoogleSession(data.session)
        setGoogleToken(readGoogleToken())
      } else {
        sessionStorage.removeItem('syncup-gcal-pending')
      }
      setUser(toSession(data.session?.user))
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (GOOGLE_CALENDAR_ENABLED) {
        captureGoogleSession(session)
        setGoogleToken(readGoogleToken())
        if (sessionStorage.getItem('syncup-gcal-pending') === '1' && _event === 'SIGNED_IN') {
          sessionStorage.removeItem('syncup-gcal-pending')
          if (!session?.provider_token) setCalendarNote('calendar_scope')
        }
      } else {
        sessionStorage.removeItem('syncup-gcal-pending')
      }
      setUser(toSession(session?.user))
      setReady(true)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const reload = useCallback(async () => {
    if (!user) return
    if (!hasLoaded.current) setLoading(true)
    const loadOnce = async () => {
      if (user.email) await claimAdminInvites(user.id, user.email)
      if (urlState.admin) {
        const code = parseAdminInvite(urlState.admin) ?? urlState.admin
        clearAdminParam()
        setUrlState(readUrl())
        try {
          const id = await claimAdminInvite(code)
          setActiveId(id)
          setStep('campaigns')
          setBanner(t(lang, 'invite_joined'))
        } catch (error) {
          setBanner(error instanceof InviteError ? t(lang, 'invite_invalid') : error instanceof Error ? error.message : t(lang, 'invite_invalid'))
        }
      }
      if (urlState.organizer) {
        const code = parseOrganizerInvite(urlState.organizer) ?? ''
        replaceSearch((params) => params.delete('organizer'))
        setUrlState(readUrl())
        if (!code) {
          setBanner(t(lang, 'invite_invalid'))
        } else {
          try {
            const id = await claimOrganizerInvite(code)
            replaceSearch((params) => {
              params.set('campaign', id)
              params.set('role', 'organizer')
            })
            setUrlState(readUrl())
            setActiveId(id)
            setPortalRole('choreographer')
            setBanner(t(lang, 'organizer_joined'))
          } catch (error) {
            setBanner(error instanceof InviteError ? t(lang, 'invite_invalid') : error instanceof Error ? error.message : t(lang, 'invite_invalid'))
          }
        }
      }
      if (urlState.participant) {
        const code = parseParticipantInvite(urlState.participant) ?? ''
        replaceSearch((params) => params.delete('participant'))
        setUrlState(readUrl())
        if (!code) {
          setBanner(t(lang, 'invite_invalid'))
        } else {
          try {
            const id = await claimParticipantInvite(code)
            replaceSearch((params) => {
              params.set('campaign', id)
              params.set('role', 'participant')
            })
            setUrlState(readUrl())
            setActiveId(id)
            setPortalRole('dancer')
            setBanner(t(lang, 'participant_joined'))
          } catch (error) {
            setBanner(error instanceof InviteError ? t(lang, 'invite_invalid') : error instanceof Error ? error.message : t(lang, 'invite_invalid'))
          }
        }
      }
      if (urlState.campaign) setLinkMissing(!(await campaignVisible(urlState.campaign)))
      else setLinkMissing(false)
      setCampaigns(await fetchCampaigns())
      hasLoaded.current = true
      setLoadFailed(false)
    }
    try {
      await loadOnce()
    } catch (firstError) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        await loadOnce()
        setBanner('')
      } catch {
        setLoadFailed(true)
        setBanner(firstError instanceof Error ? firstError.message : 'Could not load events')
      }
    } finally {
      setLoading(false)
    }
  }, [user, urlState.campaign, urlState.admin, urlState.organizer, urlState.participant, lang])

  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    if (!user) {
      hasLoaded.current = false
      didRoute.current = false
      setCampaigns([])
      setStep('login')
      return
    }
    void reload()
  }, [user, reload])

  useEffect(() => {
    const db = supabase
    if (!user || !db) return
    const channel = db
      .channel(`hupaak-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hupaak_campaigns' }, () => void reloadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hupaak_people' }, () => void reloadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hupaak_blocks' }, () => void reloadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hupaak_admins' }, () => void reloadRef.current())
      .subscribe()
    return () => {
      void db.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (!user || loading || !hasLoaded.current) return
    if (urlState.campaign) {
      if (didRoute.current) return
      const target = campaigns.find((campaign) => campaign.id === urlState.campaign)
      if (!target) {
        setStep('campaigns')
        return
      }
      didRoute.current = true
      setActiveId(target.id)
      const openedAsOrganizer = urlState.role === 'choreographer' && isChoreographer(target, user.id)
      if (urlState.role === 'dancer' || openedAsOrganizer) {
        setPortalRole(openedAsOrganizer ? 'choreographer' : 'dancer')
        setStep('portal')
      } else if (canManageRoster(target, user.id, user.email)) {
        setStep('choreographers')
      } else {
        setPortalRole('dancer')
        setStep('portal')
      }
      return
    }
    setStep((current) => (current === 'login' ? 'campaigns' : current))
  }, [user, loading, campaigns, urlState])

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBanner('')
    try {
      await action()
      await reload()
      return true
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Something went wrong')
      return false
    }
  }

  function focusAuth(mode: 'signin' | 'signup') {
    setAuthMode(mode)
    setAuthNote('')
    document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function jumpFlow(next: FlowStep) {
    if (next !== 'setup' && !active) return
    if (next === 'setup' && active) {
      setEditing(active)
      setReadOnly(!isAdmin(active, user?.id ?? '', user?.email ?? ''))
    }
    setStep(next)
  }

  function goHome() {
    window.history.replaceState({}, '', window.location.pathname)
    didRoute.current = true
    setUrlState({ campaign: null, role: null, admin: null, organizer: null, participant: null })
    setActiveId(null)
    setStep('campaigns')
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (authPassword.length < 6) {
      setAuthNote(t(lang, 'password_short'))
      return
    }
    setAuthBusy(true)
    setAuthNote('')
    const credentials = { email: authEmail.trim(), password: authPassword }
    const result =
      authMode === 'signup'
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.href } })
        : await supabase.auth.signInWithPassword(credentials)
    setAuthBusy(false)
    if (result.error) {
      setAuthNote(result.error.message)
      return
    }
    if (authMode === 'signup' && !result.data.session) setAuthNote(t(lang, 'check_email'))
  }

  const connectCalendar = useCallback(async () => {
    if (!GOOGLE_CALENDAR_ENABLED || !supabase) return
    setCalendarNote('')
    sessionStorage.setItem('syncup-gcal-pending', '1')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        scopes: GOOGLE_CALENDAR_SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      },
    })
    if (error) {
      sessionStorage.removeItem('syncup-gcal-pending')
      setCalendarNote(error.message)
    }
  }, [])

  const shownCalendarNote = calendarNote === 'calendar_scope' ? t(lang, 'calendar_scope') : calendarNote

  const calendarApi = useMemo(
    () => ({
      token: googleToken,
      note: shownCalendarNote,
      connect: () => {
        void connectCalendar()
      },
      disconnect: () => {
        clearGoogleToken()
        setGoogleToken(null)
        setCalendarNote('')
      },
      setNote: setCalendarNote,
    }),
    [googleToken, shownCalendarNote, connectCalendar],
  )

  async function google() {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) setAuthNote(error.message)
  }

  async function joinWithInvite(raw: string) {
    const code = parseAdminInvite(raw)
    if (!code) {
      setBanner(t(lang, 'invite_invalid'))
      return
    }
    setBanner('')
    try {
      const id = await claimAdminInvite(code)
      setActiveId(id)
      setStep('campaigns')
      await reload()
      setBanner(t(lang, 'invite_joined'))
    } catch (error) {
      setBanner(error instanceof InviteError ? t(lang, 'invite_invalid') : error instanceof Error ? error.message : t(lang, 'invite_invalid'))
    }
  }

  async function saveSetup(input: CampaignInput) {
    if (!user) return
    const ok = await run(async () => {
      if (editing) await updateCampaign(editing.id, input)
      else await createCampaign(user.id, input)
    })
    if (ok) {
      setEditing(undefined)
      setStep('campaigns')
    }
  }

  return (
    <CalendarProvider value={calendarApi}>
    <div className={`${isDarkMode ? 'theme-dark' : 'theme-light'} min-h-dvh`}>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className={`absolute -left-32 top-[-8rem] h-[26rem] w-[26rem] animate-blob rounded-full bg-[#7c7bb9] blur-3xl ${isDarkMode ? 'opacity-40' : 'opacity-25'}`} />
        <div className={`absolute bottom-[-10rem] right-[-4rem] h-[22rem] w-[22rem] animate-blob rounded-full bg-[#93ba8c] blur-3xl [animation-delay:6s] ${isDarkMode ? 'opacity-25' : 'opacity-20'}`} />
      </div>

      <div className="relative z-10">
      <header className="glass-bar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
          <button type="button" onClick={() => (user ? goHome() : focusAuth('signin'))} className="flex min-w-0 items-center gap-2.5 text-left">
            <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
            <span className="min-w-0">
              <span className={`block truncate text-[15px] font-semibold tracking-tight ${textPrimary(isDarkMode)}`}>{t(lang, 'app_title')}</span>
              {active && step !== 'campaigns' && step !== 'login' && step !== 'portal' && (
                <span className={`block truncate text-xs ${textMuted(isDarkMode)}`}>{active.name}</span>
              )}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {!user && (
              <button type="button" onClick={() => focusAuth('signin')} className="min-h-11 rounded-full px-3 text-sm font-medium">
                {t(lang, 'sign_in')}
              </button>
            )}
            <button type="button" onClick={() => setSettingsOpen(true)} className="glass-well flex h-11 w-11 items-center justify-center rounded-full" aria-label={t(lang, 'settings')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            {user && (
              <button type="button" onClick={() => void supabase?.auth.signOut()} className={`min-h-11 rounded-full px-3 text-sm ${textMuted(isDarkMode)}`}>
                {t(lang, 'sign_out')}
              </button>
            )}
          </div>
        </div>
        {user && (step === 'setup' || step === 'choreographers' || step === 'dancers' || step === 'results') && (
          <div className="mx-auto max-w-6xl px-3 pb-1 sm:px-6">
            <FlowSteps
              lang={lang}
              current={step}
              enabled={{
                setup: true,
                choreographers: Boolean(active && canManageRoster(active, user.id, user.email)),
                dancers: Boolean(active && canManageRoster(active, user.id, user.email)),
                results: Boolean(active),
              }}
              onJump={jumpFlow}
            />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        {banner && <p className="glass mb-4 rounded-2xl px-4 py-3 text-sm font-bold text-[#f19ba8]">{banner}</p>}
        {linkMissing && step === 'campaigns' && (
          <p className="glass mb-4 rounded-2xl px-4 py-3 text-sm font-bold text-[#c9a227]">{t(lang, 'not_found')}</p>
        )}
        {!ready || (user && loading && campaigns.length === 0) ? (
          <p className={`py-24 text-center ${textMuted(isDarkMode)}`}>{t(lang, 'loading')}</p>
        ) : supabaseConfigError ? (
          <p className="py-24 text-center">{supabaseConfigError}</p>
        ) : !user ? (
          <Landing
            lang={lang}
            isDarkMode={isDarkMode}
            mode={authMode}
            email={authEmail}
            password={authPassword}
            busy={authBusy}
            note={authNote}
            onMode={() => {
              setAuthMode(authMode === 'signin' ? 'signup' : 'signin')
              setAuthNote('')
            }}
            onEmail={setAuthEmail}
            onPassword={setAuthPassword}
            onSubmit={(event) => void submitAuth(event)}
            onGoogle={() => void google()}
            onFocusAuth={focusAuth}
          />
        ) : step === 'campaigns' ? (
          <CampaignList
            lang={lang}
            isDarkMode={isDarkMode}
            campaigns={campaigns}
            userId={user.id}
            email={user.email}
            onCreate={() => {
              setActiveId(null)
              setEditing(undefined)
              setReadOnly(false)
              setStep('setup')
            }}
            onOpen={(campaign, mode) => {
              setActiveId(campaign.id)
              setEditing(campaign)
              setReadOnly(mode === 'view' || !isAdmin(campaign, user.id, user.email))
              setStep('setup')
            }}
            onDelete={(campaign) => {
              if (window.confirm(t(lang, 'delete_confirm'))) void run(() => deleteCampaign(campaign.id))
            }}
            onChoreographers={(campaign) => {
              setActiveId(campaign.id)
              setStep('choreographers')
            }}
            onDancers={(campaign) => {
              setActiveId(campaign.id)
              setStep('dancers')
            }}
            onResults={(campaign) => {
              setActiveId(campaign.id)
              setStep('results')
            }}
            onPortal={(campaign, role) => {
              setActiveId(campaign.id)
              setPortalRole(role)
              setStep('portal')
            }}
            onCopy={(url) => {
              void navigator.clipboard.writeText(url)
              setBanner(t(lang, 'link_copied'))
            }}
            onJoinAdmin={(value) => void joinWithInvite(value)}
          />
        ) : step === 'setup' || step === 'choreographers' || step === 'dancers' || step === 'results' ? (
          <>
            {step === 'setup' ? (
              <SetupPanel
                key={editing?.id ?? 'new'}
                lang={lang}
                isDarkMode={isDarkMode}
                initial={editing ? (active ?? editing) : undefined}
                readOnly={readOnly}
                onCancel={() => setStep('campaigns')}
                onEdit={editing && user && isAdmin(editing, user.id, user.email) ? () => setReadOnly(false) : undefined}
                onConfirm={(input) => void saveSetup(input)}
                onCopy={(value) => {
                  void navigator.clipboard.writeText(value)
                  setBanner(t(lang, 'link_copied'))
                }}
                onRotateInvite={
                  editing
                    ? () =>
                        void run(async () => {
                          await rotateAdminInvite(editing.id)
                          setBanner(t(lang, 'invite_rotated'))
                        })
                    : undefined
                }
                onRotateOrganizer={
                  editing
                    ? () =>
                        void run(async () => {
                          await rotateOrganizerInvite(editing.id)
                          setBanner(t(lang, 'invite_rotated'))
                        })
                    : undefined
                }
                onRotateParticipant={
                  editing
                    ? () =>
                        void run(async () => {
                          await rotateParticipantInvite(editing.id)
                          setBanner(t(lang, 'invite_rotated'))
                        })
                    : undefined
                }
                onRemoveAdmin={(adminId) => void run(() => removeAdmin(adminId))}
              />
            ) : step === 'choreographers' && active ? (
              <RosterPanel
                lang={lang}
                isDarkMode={isDarkMode}
                campaign={active}
                variant="choreographer"
                onBack={() => setStep('campaigns')}
                onNext={() => setStep('dancers')}
                onSave={(input) => run(() => saveRosterPerson({ campaignId: active.id, ...input }))}
                onDelete={async (personId) => {
                  await run(() => deletePerson(personId))
                }}
              />
            ) : step === 'dancers' && active ? (
              <RosterPanel
                lang={lang}
                isDarkMode={isDarkMode}
                campaign={active}
                variant="dancer"
                onBack={() => setStep('choreographers')}
                onNext={() => setStep('results')}
                onSave={(input) => run(() => saveRosterPerson({ campaignId: active.id, ...input }))}
                onDelete={async (personId) => {
                  await run(() => deletePerson(personId))
                }}
              />
            ) : step === 'results' && active ? (
              <ResultsPanel
                key={active.id}
                lang={lang}
                isDarkMode={isDarkMode}
                campaign={active}
                onBack={() => setStep(canManageRoster(active, user.id, user.email) ? 'dancers' : 'campaigns')}
                canPin={canManageRoster(active, user.id, user.email)}
                canSetDuration={isAdmin(active, user.id, user.email)}
                onSaveSlots={(slots) => {
                  if (!canManageRoster(active, user.id, user.email)) return
                  setCampaigns((current) => current.map((campaign) => (campaign.id === active.id ? { ...campaign, savedSlots: slots } : campaign)))
                  void run(() => setSavedSlots(active.id, slots))
                }}
                onSaveDuration={(hours) => {
                  if (!isAdmin(active, user.id, user.email)) return
                  const config = { ...active.config, durationHours: hours }
                  setCampaigns((current) => current.map((campaign) => (campaign.id === active.id ? { ...campaign, config } : campaign)))
                  void run(() =>
                    updateCampaign(active.id, {
                      name: active.name,
                      remarks: active.remarks,
                      config,
                      expiryDate: active.expiryDate,
                      onDays: active.onDays,
                      compulsoryDays: active.compulsoryDays,
                    }),
                  )
                }}
              />
            ) : null}
          </>
        ) : step === 'portal' && active ? (
          <DancerPortal
            key={`${active.id}-${user.id}`}
            lang={lang}
            isDarkMode={isDarkMode}
            campaign={active}
            userId={user.id}
            email={user.email}
            linkRole={portalRole}
            onBack={goHome}
            onSave={(input) =>
              run(() =>
                savePortalPerson({
                  campaignId: active.id,
                  userId: user.id,
                  email: user.email,
                  ...input,
                }),
              )
            }
          />
        ) : loadFailed ? (
          <div className="py-24 text-center">
            <button type="button" onClick={() => void reload()} className={primaryButton('px-8 py-3')}>
              {t(lang, 'try_again')}
            </button>
          </div>
        ) : (
          <p className={`py-24 text-center ${textMuted(isDarkMode)}`}>{t(lang, 'loading')}</p>
        )}
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-md sm:items-center sm:p-4" onClick={() => setSettingsOpen(false)}>
          <div className={`${cardClass(isDarkMode)} max-h-[85dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-[1.75rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[1.75rem] sm:p-6`} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className={`font-serif text-2xl ${textPrimary(isDarkMode)}`}>{t(lang, 'settings')}</h3>
              <button type="button" onClick={() => setSettingsOpen(false)} className="flex h-11 w-11 items-center justify-center text-2xl text-zinc-400" aria-label={t(lang, 'cancel')}>×</button>
            </div>
            <label className="block space-y-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
              {t(lang, 'language')}
              <select value={lang} onChange={(event) => setLang(event.target.value as Language)} className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${inputClass(isDarkMode)}`}>
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{t(lang, 'dark_mode')}</span>
              <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className={`h-6 w-12 rounded-full p-1 ${isDarkMode ? 'bg-[#7c7bb9]' : 'bg-zinc-300'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition ${isDarkMode ? 'translate-x-6' : ''}`} />
              </button>
            </div>
            {GOOGLE_CALENDAR_ENABLED && (
              <div className="space-y-2 border-t border-white/10 pt-4">
                <p className="text-sm font-medium">{googleToken ? t(lang, 'calendar_connected') : t(lang, 'calendar_connect')}</p>
                <p className={`text-xs leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'calendar_hint')}</p>
                {shownCalendarNote && <p className="text-xs text-[#f19ba8]">{shownCalendarNote}</p>}
                {googleToken ? (
                  <button type="button" onClick={calendarApi.disconnect} className="text-sm text-[#f19ba8]">
                    {t(lang, 'calendar_disconnect')}
                  </button>
                ) : (
                  <button type="button" onClick={() => void connectCalendar()} className={primaryButton('px-4 py-2 text-sm')}>
                    {t(lang, 'calendar_connect')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
    </CalendarProvider>
  )
}
