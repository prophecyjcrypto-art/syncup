export function parseAdminInvite(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let raw = trimmed
  try {
    const url = new URL(trimmed)
    raw = url.searchParams.get('admin') ?? ''
  } catch {
    raw = trimmed
  }
  const code = raw.toLowerCase().replace(/-/g, '')
  return /^[a-f0-9]{32}$/.test(code) ? code : null
}

export function adminInviteUrl(code: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  url.searchParams.set('admin', code)
  return url.toString()
}
