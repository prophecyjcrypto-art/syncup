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
  return campaign.choreographers.some((person) => person.userId === userId)
}

export function canManageRoster(campaign: Campaign, userId: string, email: string): boolean {
  return isAdmin(campaign, userId, email) || isChoreographer(campaign, userId)
}
