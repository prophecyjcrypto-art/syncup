/** Crockford base32. Generated codes omit I, L, O, and U. */
export const SHORT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SHORT_CODE_LENGTH = 7

const HEX = /^[a-f0-9]{32}$/
const SHORT = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$/

export type InviteKind = 'admin' | 'organizer' | 'participant' | 'group'

export interface ParsedInvite {
  code: string
  kind: InviteKind | 'any'
}

export function normalizeShortCode(value: string): string | null {
  const mapped = value
    .trim()
    .toUpperCase()
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0')
  return SHORT.test(mapped) ? mapped : null
}

export function normalizeLongCode(value: string): string | null {
  const code = value.trim().toLowerCase().replace(/-/g, '')
  return HEX.test(code) ? code : null
}

export function shortCodeFromPath(pathname: string): string | null {
  const parts = (pathname.split('?')[0].replace(/\/+$/, '') || '/').split('/').filter(Boolean)
  if (parts.length === 2 && parts[0] === 'i') return normalizeShortCode(parts[1])
  if (parts.length === 1) return normalizeShortCode(parts[0])
  return null
}

function kindFromQuery(params: URLSearchParams): ParsedInvite | null {
  const admin = params.get('admin')
  const organizer = params.get('organizer')
  const participant = params.get('participant')
  if (admin) {
    const code = normalizeLongCode(admin) ?? normalizeShortCode(admin)
    if (code) return { code, kind: 'admin' }
  }
  if (organizer) {
    const code = normalizeLongCode(organizer) ?? normalizeShortCode(organizer)
    if (code) return { code, kind: 'organizer' }
  }
  if (participant) {
    const code = normalizeLongCode(participant) ?? normalizeShortCode(participant)
    if (code) return { code, kind: 'participant' }
  }
  return null
}

export function parseInviteInput(value: string): ParsedInvite | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    const fromQuery = kindFromQuery(url.searchParams)
    if (fromQuery) return fromQuery
    const fromPath = shortCodeFromPath(url.pathname)
    if (fromPath) return { code: fromPath, kind: 'any' }
    return null
  } catch {
    const hex = normalizeLongCode(trimmed)
    if (hex) return { code: hex, kind: 'any' }
    const short = normalizeShortCode(trimmed)
    if (short) return { code: short, kind: 'any' }
    return null
  }
}

export function parseAdminInvite(value: string): string | null {
  const parsed = parseInviteInput(value)
  if (!parsed || (parsed.kind !== 'admin' && parsed.kind !== 'any')) return null
  return parsed.code
}

export function parseOrganizerInvite(value: string): string | null {
  const parsed = parseInviteInput(value)
  if (!parsed || (parsed.kind !== 'organizer' && parsed.kind !== 'any')) return null
  return parsed.code
}

export function parseParticipantInvite(value: string): string | null {
  const parsed = parseInviteInput(value)
  if (!parsed || (parsed.kind !== 'participant' && parsed.kind !== 'any')) return null
  return parsed.code
}

function inviteUrl(param: 'admin' | 'organizer' | 'participant', code: string): string {
  const origin = typeof window === 'undefined' ? 'https://syncup-time.com' : window.location.origin
  const url = new URL('/', origin)
  url.searchParams.set(param, code)
  return url.toString()
}

export function adminInviteUrl(code: string): string {
  return inviteUrl('admin', code)
}

export function organizerInviteUrl(code: string): string {
  return inviteUrl('organizer', code)
}

export function participantInviteUrl(code: string): string {
  return inviteUrl('participant', code)
}

/** Share path is /i/<code> so it does not collide with /dev/results or static files. */
export function shortInviteUrl(code: string): string {
  const origin = typeof window === 'undefined' ? 'https://syncup-time.com' : window.location.origin
  const short = normalizeShortCode(code) ?? code.trim().toUpperCase()
  return `${origin}/i/${short}`
}

export function preferredInviteLink(short: string | null, longCode: string | null, kind: 'admin' | 'organizer' | 'participant'): string {
  if (short) return shortInviteUrl(short)
  if (!longCode) return ''
  if (kind === 'admin') return adminInviteUrl(longCode)
  if (kind === 'organizer') return organizerInviteUrl(longCode)
  return participantInviteUrl(longCode)
}

export function preferredInviteCode(short: string | null, longCode: string | null): string | null {
  return short || longCode
}
