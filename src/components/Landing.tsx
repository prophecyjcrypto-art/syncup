import type { FormEvent } from 'react'
import { t } from '../i18n'
import { cardClass, inputClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import type { Language } from '../types'

export function Landing({
  lang,
  isDarkMode,
  mode,
  email,
  password,
  busy,
  note,
  onMode,
  onEmail,
  onPassword,
  onSubmit,
  onGoogle,
  onFocusAuth,
}: {
  lang: Language
  isDarkMode: boolean
  mode: 'signin' | 'signup'
  email: string
  password: string
  busy: boolean
  note: string
  onMode: () => void
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onGoogle: () => void
  onFocusAuth: (mode: 'signin' | 'signup') => void
}) {
  return (
    <div className="mx-auto max-w-5xl pb-20">
      <section className="px-1 pb-12 pt-8 text-center sm:pb-16 sm:pt-24">
        <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${textMuted(isDarkMode)}`}>{t(lang, 'hero_kicker')}</p>
        <img src="/logo.png" alt="" className="mx-auto mt-6 h-14 w-14 object-contain sm:mt-8 sm:h-16 sm:w-16" />
        <h1 className={`mt-5 font-serif text-5xl font-semibold sm:mt-6 sm:text-7xl ${textPrimary(isDarkMode)}`}>{t(lang, 'app_title')}</h1>
        <p className={`mx-auto mt-4 max-w-xl text-2xl font-medium tracking-tight sm:text-3xl ${textPrimary(isDarkMode)}`}>
          {t(lang, 'hero_title')}
        </p>
        <p className={`mx-auto mt-5 max-w-lg text-base leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, 'hero_body')}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => onFocusAuth('signup')} className={primaryButton('px-7 py-3 text-sm')}>
            {t(lang, 'get_started')}
          </button>
          <button type="button" onClick={() => onFocusAuth('signin')} className="glass-well rounded-full px-7 py-3 text-sm font-medium">
            {t(lang, 'sign_in')}
          </button>
        </div>
      </section>

      <form id="account" onSubmit={onSubmit} className={`${cardClass(isDarkMode)} mx-auto mt-12 w-full max-w-md space-y-4 rounded-[1.75rem] p-5 sm:p-7`}>
        <h2 className={`font-serif text-3xl font-semibold ${textPrimary(isDarkMode)}`}>
          {mode === 'signin' ? t(lang, 'sign_in') : t(lang, 'sign_up')}
        </h2>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          placeholder={t(lang, 'email')}
          className={`min-h-12 w-full rounded-2xl px-4 py-3 ${inputClass(isDarkMode)}`}
        />
        <input
          type="password"
          required
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          placeholder={t(lang, 'password')}
          className={`min-h-12 w-full rounded-2xl px-4 py-3 ${inputClass(isDarkMode)}`}
        />
        {note && <p className="text-sm text-[#c9a227]">{note}</p>}
        <button type="submit" disabled={busy} className={primaryButton('min-h-12 w-full py-3 text-sm')}>
          {mode === 'signin' ? t(lang, 'sign_in') : t(lang, 'sign_up')}
        </button>
        <button type="button" onClick={onGoogle} className="glass-well min-h-12 w-full rounded-full py-3 text-sm font-medium">
          {t(lang, 'google')}
        </button>
        <button type="button" onClick={onMode} className={`w-full text-sm ${textMuted(isDarkMode)}`}>
          {mode === 'signin' ? t(lang, 'need_account') : t(lang, 'have_account')}
        </button>
      </form>
    </div>
  )
}
