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

/** Static product UI for the hero — real heat-grid language, not a dashboard collage. */
function HeroHeatMock({ isDarkMode }: { isDarkMode: boolean }) {
  const days = ['四', '五', '六', '日', '一', '二', '三']
  // Scores map to all four logo circles: purple / sage / gold / pink.
  const rows = [
    [70, 70, 90, 70, 40, 55, 70],
    [70, 90, 90, 40, 90, 70, 55],
    [55, 70, 40, 90, 70, 70, 70],
    [70, 40, 70, 55, 90, 90, 40],
  ]
  function tone(score: number) {
    if (score >= 90) return 'bg-[color:var(--logo-purple)]'
    if (score >= 70) return 'bg-[color:var(--logo-sage)]'
    if (score >= 50) return 'bg-[color:var(--logo-gold)]'
    return 'bg-[color:var(--logo-pink)]'
  }
  return (
    <div
      className={`hero-heat-mock mx-auto mt-10 w-full max-w-3xl overflow-hidden rounded-[var(--r-lg)] p-3 sm:mt-12 sm:p-4 ${
        isDarkMode ? 'glass' : 'glass'
      }`}
      aria-hidden
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className={`text-[11px] font-semibold tabular-nums ${textMuted(isDarkMode)}`}>16:00–18:00 · 2h</span>
        <span className="rounded-full bg-[color:var(--logo-pink)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--logo-pink-ink)]">3 / 4</span>
      </div>
      <div className="grid grid-cols-[1.6rem_repeat(7,minmax(0,1fr))] gap-1">
        <span />
        {days.map((day) => (
          <span key={day} className={`text-center text-[10px] font-bold ${textMuted(isDarkMode)}`}>
            {day}
          </span>
        ))}
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="contents">
            <span className={`self-center text-right text-[9px] font-bold tabular-nums ${textMuted(isDarkMode)}`}>
              {16 + rowIndex}:{rowIndex % 2 ? '30' : '00'}
            </span>
            {row.map((score, col) => (
              <span
                key={`${rowIndex}-${col}`}
                className={`h-7 rounded-[0.35rem] sm:h-8 ${tone(score)} ${col === 2 && rowIndex < 2 ? 'ring-1 ring-[color:var(--logo-pink)]' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

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
    <div className="mx-auto max-w-5xl pb-[var(--s-9)]">
      <section className="landing-hero px-1 pt-[var(--s-6)] text-center sm:pt-[var(--s-8)]" data-enter="">
        <img src="/logo.png" alt="" className="mx-auto h-16 w-16 object-contain sm:h-20 sm:w-20" />
        <h1 className={`mt-5 font-serif text-6xl tracking-[-0.03em] sm:mt-6 sm:text-8xl ${textPrimary(isDarkMode)}`}>
          {t(lang, 'app_title')}
        </h1>
        <p className={`mx-auto mt-4 max-w-xl text-sm leading-relaxed text-pretty sm:text-base ${textMuted(isDarkMode)}`}>
          {t(lang, 'hero_body')}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => onFocusAuth('signup')} className={primaryButton('btn-press min-h-11 px-7 py-3 text-sm')}>
            {t(lang, 'get_started')}
          </button>
          <button
            type="button"
            onClick={() => onFocusAuth('signin')}
            className={`btn-press min-h-11 rounded-full px-7 py-3 text-sm font-medium ${textMuted(isDarkMode)}`}
          >
            {t(lang, 'sign_in')}
          </button>
        </div>
        <HeroHeatMock isDarkMode={isDarkMode} />
      </section>

      <section className="mt-[var(--s-9)] px-1">
        <h2 className={`text-center font-serif text-2xl sm:text-3xl ${textPrimary(isDarkMode)}`}>{t(lang, 'how_title')}</h2>
        <ol className="mx-auto mt-8 max-w-xl space-y-6">
          {HOW.map(([title, body], index) => (
            <li key={title} className="flex gap-4 text-left">
              <span className="font-mono text-[12px] font-medium tabular-nums text-[color:var(--logo-pink)] opacity-80">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <h3 className={`text-base font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, title)}</h3>
                <p className={`mt-1 text-[13px] leading-relaxed text-pretty sm:text-sm ${textMuted(isDarkMode)}`}>{t(lang, body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <form id="account" onSubmit={onSubmit} className={`${cardClass(isDarkMode)} card-pad mx-auto mt-12 w-full max-w-md space-y-4 sm:mt-16`}>
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
        {note && <p className="text-sm text-[color:var(--logo-gold)]">{note}</p>}
        <button type="submit" disabled={busy} className={primaryButton('btn-press min-h-12 w-full py-3 text-sm')}>
          {mode === 'signin' ? t(lang, 'sign_in') : t(lang, 'sign_up')}
        </button>
        <button type="button" onClick={onGoogle} className="btn-press glass-well min-h-12 w-full rounded-full py-3 text-sm font-medium">
          {t(lang, 'google')}
        </button>
        <button type="button" onClick={onMode} className={`w-full text-sm ${textMuted(isDarkMode)}`}>
          {mode === 'signin' ? t(lang, 'need_account') : t(lang, 'have_account')}
        </button>
      </form>
    </div>
  )
}
