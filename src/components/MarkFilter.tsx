import { t } from '../i18n'
import { InfoTip } from './Guide'
import type { MarkFilter } from '../lib/schedule'
import type { Language } from '../types'

const MODES: MarkFilter[] = ['na', 'both', 'ok']

export function MarkFilterControl({
  lang,
  value,
  onChange,
}: {
  lang: Language
  value: MarkFilter
  onChange: (value: MarkFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full p-0.5 glass-well" data-mark-filter={value}>
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
              className={`min-h-11 rounded-full px-3 text-xs font-bold ${on ? tone : ''}`}
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
