import { t } from '../i18n'
import { textMuted, textPrimary } from '../lib/ui'
import { InfoTip } from './Guide'
import type { Language } from '../types'

export function InviteCode({
  lang,
  isDarkMode,
  label,
  hint,
  code,
  empty,
  readOnly,
  onCopy,
  onRotate,
}: {
  lang: Language
  isDarkMode: boolean
  label: string
  hint?: string
  code: string | null
  empty?: string
  readOnly?: boolean
  onCopy?: (value: string, kind: 'code' | 'link') => void
  onRotate?: () => void
}) {
  const short = Boolean(code && code.length <= 8)
  return (
    <div className="space-y-2" data-invite="">
      {label || hint ? (
        <p className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
          {label}
          {hint ? <InfoTip lang={lang} name="invite" text={hint} /> : null}
        </p>
      ) : null}
      {code ? (
        <p
          data-invite-code={code}
          className={`font-mono font-semibold ${short ? 'text-[1.65rem] tracking-[0.22em]' : 'break-all text-sm tracking-wide'} ${textPrimary(isDarkMode)}`}
        >
          {code}
        </p>
      ) : (
        <p className={`text-sm ${textMuted(isDarkMode)}`}>{empty}</p>
      )}
      {code && onCopy ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onCopy(code, 'code')} className="min-h-11 rounded-full bg-[#7c7bb9] px-4 text-sm font-bold text-white">
            {t(lang, 'copy_code')}
          </button>
          <button type="button" onClick={() => onCopy(code, 'link')} className="glass-well min-h-11 rounded-full px-4 text-sm font-bold">
            {t(lang, 'copy_short_link')}
          </button>
          {!readOnly && onRotate ? (
            <button type="button" onClick={onRotate} className="min-h-11 rounded-full px-4 text-sm font-bold text-[#f19ba8]">
              {t(lang, 'rotate_invite')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
