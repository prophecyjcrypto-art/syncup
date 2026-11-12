import type { Session } from '@supabase/supabase-js'
import type { AppConfig, TimeBlock } from '../types'
import { getDaysArray, parseISODate, setTime } from './dates'

const STORAGE_KEY = 'syncup-gcal'
const TOKEN_EVENT = 'syncup-gcal'
const TOKEN_LIFE_MS = 50 * 60 * 1000

/**
 * Temporary gate until Google approves Calendar OAuth verification.
 * Set this to true to restore connect, disconnect, busy-time import, and
 * save-to-Google-Calendar. Google account sign-in does not use this flag.
 */
export const GOOGLE_CALENDAR_ENABLED: boolean = false

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export interface BusyRange {
  start: Date
  end: Date
}

interface StoredToken {
  token: string
  expiresAt: number
}

export function readGoogleToken(): string | null {
  if (!GOOGLE_CALENDAR_ENABLED) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as StoredToken
    if (!stored.token || stored.expiresAt < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return stored.token
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function rememberGoogleToken(token: string): void {
  if (!GOOGLE_CALENDAR_ENABLED) return
  const stored: StoredToken = { token, expiresAt: Date.now() + TOKEN_LIFE_MS }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  window.dispatchEvent(new Event(TOKEN_EVENT))
}

export function clearGoogleToken(): void {
  sessionStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(TOKEN_EVENT))
}

export function onGoogleToken(listener: () => void): () => void {
  window.addEventListener(TOKEN_EVENT, listener)
  return () => window.removeEventListener(TOKEN_EVENT, listener)
}

export function captureGoogleSession(session: Session | null): void {
  if (!GOOGLE_CALENDAR_ENABLED) return
  const token = session?.provider_token
  if (token) rememberGoogleToken(token)
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function googleFetch(token: string, url: string, body: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new GoogleCalendarError(detail || response.statusText, response.status)
  }
  return response
}

export async function fetchBusy(token: string, timeMin: Date, timeMax: Date): Promise<BusyRange[]> {
  if (!GOOGLE_CALENDAR_ENABLED) return []
  const response = await googleFetch(token, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    items: [{ id: 'primary' }],
  })
  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }>
  }
  const primary = data.calendars?.primary
  if (primary?.errors?.length) throw new GoogleCalendarError(primary.errors[0].reason, 403)
  return (primary?.busy ?? []).map((item) => ({ start: new Date(item.start), end: new Date(item.end) }))
}

export function busyWindow(config: AppConfig): { start: Date; end: Date } {
  const start = setTime(parseISODate(config.startDate), config.dayStartHour)
  const end = setTime(parseISODate(config.endDate), config.dayEndHour)
  return { start, end }
}

export function busyAsUnavailable(config: AppConfig, busy: BusyRange[]): TimeBlock[] {
  const blocks: TimeBlock[] = []
  for (const day of getDaysArray(parseISODate(config.startDate), parseISODate(config.endDate))) {
    const windowStart = setTime(day, config.dayStartHour)
    const windowEnd = setTime(day, config.dayEndHour)
    for (const range of busy) {
      const startMs = Math.max(windowStart.getTime(), range.start.getTime())
      const endMs = Math.min(windowEnd.getTime(), range.end.getTime())
      if (endMs - startMs < 60 * 1000) continue
      const start = new Date(startMs)
      const end = new Date(endMs)
      blocks.push({
        id: crypto.randomUUID(),
        kind: 'unavailable',
        start,
        end,
        wholeDay: startMs === windowStart.getTime() && endMs === windowEnd.getTime(),
      })
    }
  }
  return blocks
}

export async function createCalendarEvents(
  token: string,
  events: { summary: string; description: string; start: Date; end: Date }[],
): Promise<number> {
  if (!GOOGLE_CALENDAR_ENABLED) return 0
  let saved = 0
  for (const event of events) {
    await googleFetch(token, 'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: event.end.toISOString() },
    })
    saved += 1
  }
  return saved
}
