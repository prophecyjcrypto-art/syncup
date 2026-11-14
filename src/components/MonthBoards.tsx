import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Language } from '../types'
import { groupByMonth, toISODateString, weekdayLabels } from '../lib/dates'
import { beginDayRangeDrag } from '../lib/dayDrag'
import { textMuted } from '../lib/ui'

export function MonthBoards({
  days,
  lang,
  isDarkMode,
  renderDay,
  selected,
  onSelectRange,
  headerEnd,
}: {
  days: Date[]
  lang: Language
  isDarkMode: boolean
  renderDay: (day: Date) => ReactNode
  selected?: readonly string[]
  onSelectRange?: (next: string[]) => void
  headerEnd?: ReactNode
}) {
  const months = groupByMonth(days, lang)
  const labels = weekdayLabels(lang)
  const ordered = days.map((day) => toISODateString(day))

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!onSelectRange) return
    const node = (event.target as HTMLElement).closest('[data-cal-iso]')
    if (!(node instanceof HTMLElement) || node.hasAttribute('disabled')) return
    const iso = node.getAttribute('data-cal-iso')
    if (!iso) return
    beginDayRangeDrag({
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      iso,
      ordered,
      selected: new Set(selected ?? []),
      onRange: onSelectRange,
    })
  }

  return (
    <div className="space-y-6" data-month-board="" onPointerDown={onPointerDown}>
      {months.map((month, monthIndex) => (
        <div key={month.key} className="space-y-2">
          <div
            className={`flex items-center justify-between gap-2 border-b pb-2 ${
              isDarkMode ? 'border-white/10' : 'border-zinc-200'
            }`}
          >
            <h4 className={`text-xs font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>
              {month.label}
            </h4>
            {monthIndex === 0 && headerEnd ? <div className="shrink-0">{headerEnd}</div> : null}
          </div>
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
