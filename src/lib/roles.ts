import type { PersonRole } from '../types'
import type { GroupRef } from './groups'

export type RoleGrantKind = 'organizer' | 'admin'

export interface RolePerson {
  id: string
  role: PersonRole
  isOrganizer?: boolean
  email: string
}

export interface RoleAdmin {
  email: string
}

export interface RoleGrantResult {
  person: { id: string; role: PersonRole; isOrganizer: boolean }
  groups: GroupRef[]
  admins: RoleAdmin[]
}

/** Grants a role without leaving a group or dropping participant status. */
export function grantRole(input: {
  person: RolePerson
  groups: GroupRef[]
  admins: RoleAdmin[]
  grant: RoleGrantKind
}): RoleGrantResult {
  const groups = input.groups.map((group) => ({ id: group.id, memberIds: [...group.memberIds] }))
  const person = {
    id: input.person.id,
    role: input.person.role,
    isOrganizer: input.person.role === 'choreographer' || input.person.isOrganizer === true,
  }
  const admins = input.admins.map((admin) => ({ email: admin.email.toLowerCase() }))
  if (input.grant === 'organizer') {
    person.isOrganizer = true
    return { person, groups, admins }
  }
  const email = input.person.email.trim().toLowerCase()
  if (email.includes('@') && !admins.some((admin) => admin.email === email)) admins.push({ email })
  return { person, groups, admins }
}

export function organizersOf<T extends { id: string; role: PersonRole; isOrganizer?: boolean }>(people: {
  choreographers: T[]
  dancers: T[]
}): T[] {
  const seen = new Set(people.choreographers.map((person) => person.id))
  const also = people.dancers.filter((person) => person.isOrganizer && !seen.has(person.id))
  return [...people.choreographers, ...also]
}
