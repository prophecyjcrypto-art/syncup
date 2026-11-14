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
  plainLabel,
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
  plainLabel?: boolean
  onCopy?: (value: string, kind: 'code' | 'link') => void
  onRotate?: () => void
}) {
  const short = Boolean(code && code.length <= 8)
  const codeNode = code ? (
    <p
      data-invite-code={code}
      className={`font-mono font-medium ${short ? 'shrink-0 text-[15px] tracking-[0.12em]' : 'min-w-0 break-all text-sm tracking-wide'} ${textPrimary(isDarkMode)}`}
    >
      {code}
    </p>
  ) : (
    <p className={`text-sm ${textMuted(isDarkMode)}`}>{empty}</p>
  )
  return (
    <div className="space-y-1.5" data-invite="">
      {label || hint ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className={`inline-flex min-w-0 items-center gap-1.5 ${plainLabel ? 'text-xs font-semibold' : 'text-[10px] font-bold uppercase tracking-widest'} ${textMuted(isDarkMode)}`}>
            <span className="truncate">{label}</span>
            {hint ? <InfoTip lang={lang} name="invite" text={hint} /> : null}
          </p>
          {short || !code ? codeNode : null}
        </div>
      ) : (
        codeNode
      )}
      {code && !short && (label || hint) ? codeNode : null}
      {code && onCopy ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onCopy(code, 'code')} className="min-h-11 rounded-full bg-[#7c7bb9] px-3 text-xs font-bold text-white">
            {t(lang, 'copy_code')}
          </button>
          <button type="button" onClick={() => onCopy(code, 'link')} className="glass-well min-h-11 rounded-full px-3 text-xs font-bold">
            {t(lang, 'copy_short_link')}
          </button>
          {!readOnly && onRotate ? (
            <button type="button" onClick={onRotate} className="min-h-11 rounded-full px-3 text-xs font-bold text-[#f19ba8]">
              {t(lang, 'rotate_invite')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
