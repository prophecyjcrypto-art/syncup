import { createContext, useContext, type ReactNode } from 'react'

export interface CalendarApi {
  token: string | null
  note: string
  connect: () => void
  disconnect: () => void
  setNote: (value: string) => void
}

const CalendarContext = createContext<CalendarApi>({
  token: null,
  note: '',
  connect: () => {},
  disconnect: () => {},
  setNote: () => {},
})

export function CalendarProvider({ value, children }: { value: CalendarApi; children: ReactNode }) {
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

export function useCalendar(): CalendarApi {
  return useContext(CalendarContext)
}
