import type { ChangeRequest, StoredBlock, TimeBlock } from '../types'
import { withBlocks } from './blocks'
import { classifySessionAttendance, type SchedulePerson } from './schedule'

export type { ChangeRequest, StoredBlock }

export interface PublishedWindow {
  key: string
  start: Date
  end: Date
}

export function storeBlocks(blocks: TimeBlock[]): StoredBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    start: block.start.toISOString(),
    end: block.end.toISOString(),
    wholeDay: block.wholeDay,
  }))
}

export function restoreBlocks(blocks: StoredBlock[]): TimeBlock[] {
  return blocks.flatMap((block) => {
    const start = new Date(block.start)
    const end = new Date(block.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
    return [{
      id: block.id || crypto.randomUUID(),
      kind: block.kind === 'available' ? 'available' as const : 'unavailable' as const,
      start,
      end,
      wholeDay: Boolean(block.wholeDay),
    }]
  })
}

function readStored(value: unknown): StoredBlock[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const block = item as Partial<StoredBlock>
    if (typeof block.start !== 'string' || typeof block.end !== 'string') return []
    return [{
      id: typeof block.id === 'string' ? block.id : crypto.randomUUID(),
      kind: block.kind === 'available' ? 'available' : 'unavailable',
      start: block.start,
      end: block.end,
      wholeDay: Boolean(block.wholeDay),
    }]
  })
}

export function readChangeRequests(value: unknown): ChangeRequest[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Partial<ChangeRequest>
    if (typeof row.id !== 'string' || typeof row.personId !== 'string') return []
    const status = row.status === 'accepted' || row.status === 'declined' ? row.status : 'pending'
    return [{
      id: row.id,
      personId: row.personId,
      personName: typeof row.personName === 'string' ? row.personName : '',
      sessionKeys: Array.isArray(row.sessionKeys) ? row.sessionKeys.filter((key): key is string => typeof key === 'string') : [],
      previousBlocks: readStored(row.previousBlocks),
      proposedBlocks: readStored(row.proposedBlocks),
      status,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    }]
  })
}

function person(blocks: TimeBlock[]): SchedulePerson {
  return { id: 'person', blocks }
}

/** Published sessions that this save would turn from attendable into NA. */
export function conflictingSessionKeys(
  current: TimeBlock[],
  proposed: TimeBlock[],
  sessions: PublishedWindow[],
  toleranceMs: number,
): string[] {
  return sessions.flatMap((session) => {
    const before = classifySessionAttendance(person(current), session.start.getTime(), session.end.getTime(), toleranceMs).status
    const after = classifySessionAttendance(person(proposed), session.start.getTime(), session.end.getTime(), toleranceMs).status
    return before !== 'na' && after === 'na' ? [session.key] : []
  })
}

function overlaps(block: TimeBlock, start: number, end: number): boolean {
  return block.start.getTime() < end && block.end.getTime() > start
}

/** Keep the current blocks that cover conflicting sessions. Apply the rest of the proposal. */
export function mergeKeepingSessions(current: TimeBlock[], proposed: TimeBlock[], windows: { start: Date; end: Date }[]): TimeBlock[] {
  if (windows.length === 0) return proposed
  const hits = (block: TimeBlock) => windows.some((window) => overlaps(block, window.start.getTime(), window.end.getTime()))
  const kept = current.filter(hits).map((block) => ({ ...block, id: crypto.randomUUID() }))
  const added = proposed.filter((block) => !hits(block)).map((block) => ({ ...block, id: crypto.randomUUID() }))
  return [...kept, ...added]
}

/** Ask to miss one published session without writing that NA until it is accepted. */
export function proposeMissedSession(current: TimeBlock[], start: Date, end: Date): TimeBlock[] {
  return withBlocks(current, [{
    id: crypto.randomUUID(),
    kind: 'unavailable',
    start,
    end,
    wholeDay: false,
  }])
}
