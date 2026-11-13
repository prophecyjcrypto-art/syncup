import type { HourRange } from './timeRange'

export interface SessionRange extends HourRange {
  id: string
  iso: string
}

export function rangesOverlap(left: HourRange, right: HourRange): boolean {
  return left.startHour < right.endHour && right.startHour < left.endHour
}

/** Add or redraw a session. Never mutates the input list. */
export function commitSessions(
  current: SessionRange[],
  block: SessionRange,
  sourceId: string | null,
): { sessions: SessionRange[]; focusId: string } {
  if (sourceId && current.some((item) => item.id === sourceId)) {
    return {
      sessions: current.map((item) => (item.id === sourceId ? { ...block, id: sourceId } : item)),
      focusId: sourceId,
    }
  }
  const overlap = current.find((item) => item.iso === block.iso && rangesOverlap(item, block))
  if (overlap) {
    return {
      sessions: current.map((item) => (item.id === overlap.id ? { ...block, id: overlap.id } : item)),
      focusId: overlap.id,
    }
  }
  const id = block.id || crypto.randomUUID()
  return { sessions: [...current, { ...block, id }], focusId: id }
}

/** Copy the focused hours onto a day, or remove that exact copy. Other slots on the day stay. */
export function toggleSessionDay(
  current: SessionRange[],
  iso: string,
  source: SessionRange,
  id = crypto.randomUUID(),
): { sessions: SessionRange[]; focusId: string | null } {
  const exact = current.find((item) => item.iso === iso && item.startHour === source.startHour && item.endHour === source.endHour)
  if (exact) {
    const sessions = current.filter((item) => item.id !== exact.id)
    const preferred = exact.id === source.id ? (sessions[0]?.id ?? null) : source.id
    const focusId = preferred && sessions.some((item) => item.id === preferred) ? preferred : (sessions[0]?.id ?? null)
    return { sessions, focusId }
  }
  if (current.some((item) => item.id === id)) return { sessions: current, focusId: id }
  return { sessions: [...current, { ...source, id, iso }], focusId: id }
}

/** Append shortlist keys. Existing keys stay, in their original order. */
export function addPins(saved: string[], keys: string[]): string[] {
  const next = [...saved]
  for (const key of keys) {
    if (!next.includes(key)) next.push(key)
  }
  return next
}

/** Null means do not write. Empty sessions and unchanged shortlists never rewrite saved times. */
export function pinsToSave(canPin: boolean, saved: string[], keys: string[]): string[] | null {
  if (!canPin || keys.length === 0) return null
  const next = addPins(saved, keys)
  if (next.length === saved.length && next.every((key, index) => key === saved[index])) return null
  return next
}
