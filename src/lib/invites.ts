function parseInviteCode(value: string, param: 'admin' | 'organizer' | 'participant'): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let raw = trimmed
  try {
    const url = new URL(trimmed)
    raw = url.searchParams.get(param) ?? ''
  } catch {
    raw = trimmed
  }
  const code = raw.toLowerCase().replace(/-/g, '')
  return /^[a-f0-9]{32}$/.test(code) ? code : null
}

export function parseAdminInvite(value: string): string | null {
  return parseInviteCode(value, 'admin')
}

export function parseOrganizerInvite(value: string): string | null {
  return parseInviteCode(value, 'organizer')
}

export function parseParticipantInvite(value: string): string | null {
  return parseInviteCode(value, 'participant')
}

function inviteUrl(param: 'admin' | 'organizer' | 'participant', code: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
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
