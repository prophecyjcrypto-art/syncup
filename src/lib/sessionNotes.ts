import type { SessionNote } from '../types'

/** Keep every published key, including a session that has no venue or remarks yet. */
export function readSessionNotes(value: unknown): Record<string, SessionNote> {
  if (!value || typeof value !== 'object') return {}
  const notes: Record<string, SessionNote> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const note = raw as { venue?: unknown; remarks?: unknown }
    notes[key] = {
      venue: typeof note.venue === 'string' ? note.venue : '',
      remarks: typeof note.remarks === 'string' ? note.remarks : '',
    }
  }
  return notes
}

/** Organizers read saved slots. Everyone else reads the same times from the published notes. */
export function publishedSlotKeys(savedSlots: string[], notes: Record<string, SessionNote> | undefined): string[] {
  if (savedSlots.length > 0) return savedSlots
  return Object.keys(notes ?? {})
}
