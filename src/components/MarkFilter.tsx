import { t } from '../i18n'
import { InfoTip } from './Guide'
import type { MarkFilter } from '../lib/schedule'
import type { Language } from '../types'

const MODES: MarkFilter[] = ['na', 'both', 'ok']

export function MarkFilterControl({
  lang,
  value,
  onChange,
  wide = false,
}: {
  lang: Language
  value: MarkFilter
  onChange: (value: MarkFilter) => void
  wide?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${wide ? 'w-full' : 'flex-wrap'}`}>
      <div className={`${wide ? 'flex min-w-0 flex-1' : 'inline-flex'} rounded-full p-0.5 glass-well`} data-mark-filter={value}>
        {MODES.map((mode) => {
          const on = value === mode
          const tone = mode === 'na' ? 'bg-[#f19ba8] text-white' : mode === 'ok' ? 'bg-[#93ba8c] text-white' : 'bg-[#7c7bb9] text-white'
          return (
            <button
              key={mode}
              type="button"
              data-mark={mode}
              aria-pressed={on}
              onClick={() => onChange(mode)}
              className={`min-h-11 rounded-full text-xs font-bold ${wide ? 'flex-1 px-2' : 'px-3'} ${on ? tone : ''}`}
            >
              {t(lang, mode === 'na' ? 'mode_unavailable' : mode === 'ok' ? 'mode_available' : 'filter_both')}
            </button>
          )
        })}
      </div>
      <InfoTip lang={lang} name="marks" text={t(lang, 'guide_marks')} />
    </div>
  )
}
