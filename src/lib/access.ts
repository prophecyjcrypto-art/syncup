import type { Campaign } from '../types'

export function isOwner(campaign: Campaign, userId: string): boolean {
  return campaign.ownerId === userId
}

export function isAdmin(campaign: Campaign, userId: string, email: string): boolean {
  const mail = email.toLowerCase()
  return (
    campaign.ownerId === userId ||
    campaign.admins.some((admin) => admin.userId === userId || admin.email === mail)
  )
}

export function isChoreographer(campaign: Campaign, userId: string): boolean {
  return [...campaign.choreographers, ...campaign.dancers].some(
    (person) => person.userId === userId && (person.role === 'choreographer' || person.isOrganizer === true),
  )
}

export function canManageRoster(campaign: Campaign, userId: string, email: string): boolean {
  return isAdmin(campaign, userId, email) || isChoreographer(campaign, userId)
}

/** Results, shortlists, and organizer stats. Participants who are not organizers or admins cannot see them. */
export function canSeeResults(campaign: Campaign, userId: string, email: string): boolean {
  return canManageRoster(campaign, userId, email)
}

/** Event settings in the admin portal. Organizers and admins share this. */
export function canEditEvent(campaign: Campaign, userId: string, email: string): boolean {
  return canManageRoster(campaign, userId, email)
}
