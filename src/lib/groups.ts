export type GroupRef = { id: string; memberIds: string[] }

export type MembershipChange = { groupId: string; included: boolean }

/** Changes for one explicit move. An empty list means nothing is written. */
export function membershipChanges(
  groups: GroupRef[],
  personId: string,
  fromGroupId: string | null,
  toGroupId: string | null,
): MembershipChange[] {
  const current = groups.filter((group) => group.memberIds.includes(personId)).map((group) => group.id)
  const from = fromGroupId && current.includes(fromGroupId) ? fromGroupId : null
  if (from === toGroupId) return []
  const changes: MembershipChange[] = []
  if (toGroupId && !current.includes(toGroupId)) changes.push({ groupId: toGroupId, included: true })
  if (from && from !== toGroupId) changes.push({ groupId: from, included: false })
  return changes
}

export function peopleForTray<T extends { id: string }>(people: T[], groups: GroupRef[], groupId: string | null): T[] {
  return people.filter((person) => {
    const memberships = groups.filter((group) => group.memberIds.includes(person.id))
    if (groupId == null) return memberships.length === 0
    return memberships.some((group) => group.id === groupId)
  })
}
