import type { FormEvent } from 'react'
import { t } from '../i18n'
import { cardClass, inputClass, primaryButton, textMuted, textPrimary } from '../lib/ui'
import type { Language } from '../types'

const HOW = [
  ['how_1_title', 'how_1_body'],
  ['how_2_title', 'how_2_body'],
  ['how_3_title', 'how_3_body'],
  ['how_4_title', 'how_4_body'],
] as const

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
      <section className="px-2 pb-16 pt-16 text-center sm:pt-24">
        <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${textMuted(isDarkMode)}`}>{t(lang, 'hero_kicker')}</p>
        <img src="/logo.png" alt="" className="mx-auto mt-8 h-16 w-16 object-contain" />
        <h1 className={`mt-6 font-serif text-6xl font-semibold sm:text-7xl ${textPrimary(isDarkMode)}`}>{t(lang, 'app_title')}</h1>
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

      <section>
        <h2 className={`mb-5 text-center font-serif text-3xl font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'how_title')}</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {HOW.map(([title, body], index) => (
            <li key={title} className={`${cardClass(isDarkMode)} rounded-[1.5rem] p-6`}>
              <span className="text-[11px] font-medium tabular-nums opacity-40">{String(index + 1).padStart(2, '0')}</span>
              <h3 className={`mt-3 text-lg font-medium ${textPrimary(isDarkMode)}`}>{t(lang, title)}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${textMuted(isDarkMode)}`}>{t(lang, body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <form id="account" onSubmit={onSubmit} className={`${cardClass(isDarkMode)} mx-auto mt-16 w-full max-w-md space-y-4 rounded-[1.75rem] p-7`}>
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
          className={`w-full rounded-2xl px-4 py-3 ${inputClass(isDarkMode)}`}
        />
        <input
          type="password"
          required
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          placeholder={t(lang, 'password')}
          className={`w-full rounded-2xl px-4 py-3 ${inputClass(isDarkMode)}`}
        />
        {note && <p className="text-sm text-[#c9a227]">{note}</p>}
        <button type="submit" disabled={busy} className={primaryButton('w-full py-3 text-sm')}>
          {mode === 'signin' ? t(lang, 'sign_in') : t(lang, 'sign_up')}
        </button>
        <button type="button" onClick={onGoogle} className="glass-well w-full rounded-full py-3 text-sm font-medium">
          {t(lang, 'google')}
        </button>
        <button type="button" onClick={onMode} className={`w-full text-sm ${textMuted(isDarkMode)}`}>
          {mode === 'signin' ? t(lang, 'need_account') : t(lang, 'have_account')}
        </button>
      </form>
    </div>
  )
}
