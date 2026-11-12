import type { ReactNode } from 'react'
import type { Language } from '../types'
import { groupByMonth, toISODateString, weekdayLabels } from '../lib/dates'
import { textMuted } from '../lib/ui'

export function MonthBoards({
  days,
  lang,
  isDarkMode,
  renderDay,
}: {
  days: Date[]
  lang: Language
  isDarkMode: boolean
  renderDay: (day: Date) => ReactNode
}) {
  const months = groupByMonth(days, lang)
  const labels = weekdayLabels(lang)

  return (
    <div className="space-y-6">
      {months.map((month) => (
        <div key={month.key} className="space-y-2">
          <h4
            className={`border-b pb-2 text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)} ${
              isDarkMode ? 'border-white/10' : 'border-zinc-200'
            }`}
          >
            {month.label}
          </h4>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {labels.map((label) => (
              <div key={`${month.key}-${label}`} className={`text-center text-[10px] font-bold ${textMuted(isDarkMode)}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {month.cells.map((day, index) =>
              day ? (
                <div key={toISODateString(day)}>{renderDay(day)}</div>
              ) : (
                <div key={`${month.key}-pad-${index}`} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
