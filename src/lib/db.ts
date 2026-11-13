import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppConfig, BlockKind, Campaign, CampaignInput, DanceGroup, Person, PersonRole, TimeBlock } from '../types'
import type { InviteKind } from './invites'
import { sortBlocks } from './blocks'
import { todayISO } from './dates'
import { normalizeDurationHours } from './schedule'
import { supabase } from './supabase'

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

interface BlockRow {
  id: string
  kind: string
  starts_at: string
  ends_at: string
  whole_day: boolean
}

interface PersonRow {
  id: string
  user_id: string | null
  name: string
  email: string | null
  role: string
  last_updated: string | null
  blocks: BlockRow[] | null
}

interface AdminRow {
  id: string
  user_id: string | null
  email: string
}

interface CampaignRow {
  id: string
  owner_id: string
  name: string
  remarks: string | null
  config: unknown
  expiry_date: string
  on_days: string[] | null
  compulsory_days: string[] | null
  saved_slots: string[] | null
  created_at: string
  admins: AdminRow[] | null
  people: PersonRow[] | null
}

const campaignSelect = `
  id, owner_id, name, remarks, config, expiry_date, on_days, compulsory_days, saved_slots, created_at,
  admins:hupaak_admins(id, user_id, email),
  people:hupaak_people(
    id, user_id, name, email, role, last_updated,
    blocks:hupaak_blocks(id, kind, starts_at, ends_at, whole_day)
  )
`

function asConfig(value: unknown): AppConfig {
  const config = (value ?? {}) as Partial<AppConfig>
  return {
    startDate: typeof config.startDate === 'string' ? config.startDate : todayISO(),
    endDate: typeof config.endDate === 'string' ? config.endDate : todayISO(),
    durationHours: normalizeDurationHours(config.durationHours),
    dayStartHour: Number(config.dayStartHour ?? 9),
    dayEndHour: Number(config.dayEndHour ?? 22),
    attendanceTolerance: Number(config.attendanceTolerance ?? 0),
  }
}

function asDates(value: string[] | null): string[] {
  return (value ?? []).map(String).sort()
}

function mapBlock(row: BlockRow): TimeBlock {
  return {
    id: row.id,
    kind: row.kind === 'available' ? 'available' : 'unavailable',
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    wholeDay: Boolean(row.whole_day),
  }
}

function mapPerson(row: PersonRow): Person {
  const role: PersonRole = row.role === 'choreographer' ? 'choreographer' : 'dancer'
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email ?? '',
    role,
    blocks: sortBlocks((row.blocks ?? []).map(mapBlock)),
    lastUpdated: row.last_updated,
  }
}

interface InvitePair {
  code: string
  short: string | null
}

function mapCampaign(
  row: CampaignRow,
  adminInvite: InvitePair | null,
  organizerInvite: InvitePair | null,
  participantInvite: InvitePair | null,
): Campaign {
  const people = (row.people ?? []).map(mapPerson).sort((left, right) => left.name.localeCompare(right.name))
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    remarks: row.remarks ?? '',
    config: asConfig(row.config),
    expiryDate: row.expiry_date,
    onDays: asDates(row.on_days),
    compulsoryDays: asDates(row.compulsory_days),
    savedSlots: row.saved_slots ?? [],
    createdAt: row.created_at,
    adminCode: adminInvite?.code ?? null,
    adminShort: adminInvite?.short ?? null,
    organizerCode: organizerInvite?.code ?? null,
    organizerShort: organizerInvite?.short ?? null,
    participantCode: participantInvite?.code ?? null,
    participantShort: participantInvite?.short ?? null,
    admins: (row.admins ?? [])
      .map((admin) => ({ id: admin.id, userId: admin.user_id, email: admin.email }))
      .sort((left, right) => left.email.localeCompare(right.email)),
    choreographers: people.filter((person) => person.role === 'choreographer'),
    dancers: people.filter((person) => person.role === 'dancer'),
    groups: [],
  }
}

function missingRelation(error: { message: string } | null, relation: string): boolean {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes(relation) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
}

function missingColumn(error: { message: string } | null, column: string): boolean {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes(column.toLowerCase()) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
}

async function inviteCodes(
  relation: 'hupaak_admin_invites' | 'hupaak_organizer_invites' | 'hupaak_participant_invites',
): Promise<Map<string, InvitePair>> {
  const db = client()
  const withShort = await db.from(relation).select('campaign_id, code, short_code')
  const invites = missingColumn(withShort.error, 'short_code')
    ? await db.from(relation).select('campaign_id, code')
    : withShort
  if (missingRelation(invites.error, relation)) return new Map()
  fail(invites.error)
  return new Map(
    ((invites.data ?? []) as { campaign_id: string; code: string; short_code?: string | null }[]).map((invite) => [
      invite.campaign_id,
      { code: invite.code, short: invite.short_code ?? null },
    ]),
  )
}

interface GroupRow {
  id: string
  campaign_id: string
  name: string
  position: number
}

async function fetchGroups(campaignIds: string[]): Promise<Map<string, DanceGroup[]>> {
  const grouped = new Map<string, DanceGroup[]>()
  if (campaignIds.length === 0) return grouped
  const db = client()
  const groups = await db
    .from('hupaak_groups')
    .select('id, campaign_id, name, position')
    .in('campaign_id', campaignIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (missingRelation(groups.error, 'hupaak_groups')) return grouped
  fail(groups.error)
  const rows = (groups.data ?? []) as GroupRow[]
  if (rows.length === 0) return grouped
  const members = await db.from('hupaak_group_members').select('group_id, person_id').in(
    'group_id',
    rows.map((row) => row.id),
  )
  if (missingRelation(members.error, 'hupaak_group_members')) {
    for (const row of rows) {
      const list = grouped.get(row.campaign_id) ?? []
      list.push({ id: row.id, name: row.name, memberIds: [], inviteCode: null })
      grouped.set(row.campaign_id, list)
    }
    return grouped
  }
  fail(members.error)
  const memberIds = new Map<string, string[]>()
  for (const member of (members.data ?? []) as { group_id: string; person_id: string }[]) {
    const list = memberIds.get(member.group_id) ?? []
    list.push(member.person_id)
    memberIds.set(member.group_id, list)
  }
  const inviteCodesByGroup = new Map<string, string>()
  const invites = await db.from('hupaak_group_invites').select('group_id, short_code').in(
    'group_id',
    rows.map((row) => row.id),
  )
  if (!invites.error) {
    for (const invite of (invites.data ?? []) as { group_id: string; short_code: string }[]) {
      inviteCodesByGroup.set(invite.group_id, invite.short_code)
    }
  }
  for (const row of rows) {
    const list = grouped.get(row.campaign_id) ?? []
    list.push({
      id: row.id,
      name: row.name,
      memberIds: memberIds.get(row.id) ?? [],
      inviteCode: inviteCodesByGroup.get(row.id) ?? null,
    })
    grouped.set(row.campaign_id, list)
  }
  return grouped
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const db = client()
  const { data, error } = await db.from('hupaak_campaigns').select(campaignSelect).order('created_at', { ascending: false })
  fail(error)
  const codes = await inviteCodes('hupaak_admin_invites')
  const organizerCodes = await inviteCodes('hupaak_organizer_invites')
  const participantCodes = await inviteCodes('hupaak_participant_invites')
  const campaigns = ((data ?? []) as CampaignRow[]).map((row) =>
    mapCampaign(row, codes.get(row.id) ?? null, organizerCodes.get(row.id) ?? null, participantCodes.get(row.id) ?? null),
  )
  let groups = new Map<string, DanceGroup[]>()
  try {
    groups = await fetchGroups(campaigns.map((campaign) => campaign.id))
  } catch {
    groups = new Map()
  }
  return campaigns.map((campaign) => ({ ...campaign, groups: groups.get(campaign.id) ?? [] }))
}

export async function campaignVisible(campaignId: string): Promise<boolean> {
  const { data, error } = await client().from('hupaak_campaigns').select('id').eq('id', campaignId).maybeSingle()
  if (error?.code === '22P02') return false
  fail(error)
  return Boolean(data)
}

export async function claimAdminInvites(userId: string, email: string): Promise<void> {
  const { error } = await client()
    .from('hupaak_admins')
    .update({ user_id: userId })
    .is('user_id', null)
    .eq('email', email.toLowerCase())
  fail(error)
}

export class InviteError extends Error {
  constructor() {
    super('invalid_invite')
    this.name = 'InviteError'
  }
}

export async function claimAdminInvite(invite: string): Promise<string> {
  const { data, error } = await client().rpc('claim_hupaak_admin', { invite })
  if (error) {
    if (/invalid invite/i.test(error.message)) throw new InviteError()
    throw new Error(error.message)
  }
  if (typeof data !== 'string') throw new InviteError()
  return data
}

export async function rotateAdminInvite(campaignId: string): Promise<void> {
  const { error } = await client().rpc('rotate_hupaak_admin_invite', { campaign: campaignId })
  fail(error)
}

export async function claimOrganizerInvite(invite: string): Promise<string> {
  const { data, error } = await client().rpc('claim_hupaak_organizer', { invite })
  if (error) {
    if (/invalid invite/i.test(error.message)) throw new InviteError()
    throw new Error(error.message)
  }
  if (typeof data !== 'string') throw new InviteError()
  return data
}

export async function rotateOrganizerInvite(campaignId: string): Promise<void> {
  const { error } = await client().rpc('rotate_hupaak_organizer_invite', { campaign: campaignId })
  fail(error)
}

export async function claimParticipantInvite(invite: string): Promise<string> {
  const { data, error } = await client().rpc('claim_hupaak_participant', { invite })
  if (error) {
    if (/invalid invite/i.test(error.message)) throw new InviteError()
    throw new Error(error.message)
  }
  if (typeof data !== 'string') throw new InviteError()
  return data
}

export async function rotateParticipantInvite(campaignId: string): Promise<void> {
  const { error } = await client().rpc('rotate_hupaak_participant_invite', { campaign: campaignId })
  fail(error)
}

export interface ClaimedInvite {
  campaignId: string
  kind: InviteKind
}

function missingRpc(error: { message: string } | null, name: string): boolean {
  if (!error) return false
  const message = error.message.toLowerCase()
  return message.includes(name.toLowerCase()) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
}

export async function claimAnyInvite(invite: string): Promise<ClaimedInvite> {
  const { data, error } = await client().rpc('claim_hupaak_invite', { invite })
  if (missingRpc(error, 'claim_hupaak_invite')) return claimAnyInviteLegacy(invite)
  if (error) {
    if (/invalid invite/i.test(error.message)) throw new InviteError()
    throw new Error(error.message)
  }
  const row = data as { campaign_id?: string; kind?: string } | null
  const kind = row?.kind
  if (!row?.campaign_id || (kind !== 'admin' && kind !== 'organizer' && kind !== 'participant' && kind !== 'group')) {
    throw new InviteError()
  }
  return { campaignId: row.campaign_id, kind }
}

async function claimAnyInviteLegacy(invite: string): Promise<ClaimedInvite> {
  const attempts: { kind: InviteKind; claim: (code: string) => Promise<string> }[] = [
    { kind: 'admin', claim: claimAdminInvite },
    { kind: 'organizer', claim: claimOrganizerInvite },
    { kind: 'participant', claim: claimParticipantInvite },
  ]
  let last = new InviteError()
  for (const attempt of attempts) {
    try {
      const campaignId = await attempt.claim(invite)
      return { campaignId, kind: attempt.kind }
    } catch (error) {
      if (!(error instanceof InviteError)) throw error
      last = error
    }
  }
  throw last
}

export function campaignNeedsShortCodes(campaign: Campaign): boolean {
  if (campaign.adminCode && !campaign.adminShort) return true
  if (campaign.organizerCode && !campaign.organizerShort) return true
  if (campaign.participantCode && !campaign.participantShort) return true
  return campaign.groups.some((group) => !group.inviteCode)
}

export async function ensureShortCodes(campaignId: string): Promise<void> {
  const { error } = await client().rpc('ensure_hupaak_short_codes', { campaign: campaignId })
  if (missingRpc(error, 'ensure_hupaak_short_codes')) return
  fail(error)
}

export async function rotateGroupInvite(groupId: string): Promise<void> {
  const { error } = await client().rpc('rotate_hupaak_group_invite', { target: groupId })
  fail(error)
}

export async function removeAdmin(adminId: string): Promise<void> {
  const { error } = await client().from('hupaak_admins').delete().eq('id', adminId)
  fail(error)
}

export async function createCampaign(userId: string, input: CampaignInput): Promise<string> {
  const { data, error } = await client()
    .from('hupaak_campaigns')
    .insert({
      owner_id: userId,
      name: input.name.trim(),
      remarks: input.remarks.trim(),
      config: input.config,
      expiry_date: input.expiryDate,
      on_days: input.onDays,
      compulsory_days: input.compulsoryDays,
    })
    .select('id')
    .single()
  fail(error)
  return (data as { id: string }).id
}

export async function updateCampaign(campaignId: string, input: CampaignInput): Promise<void> {
  const { error } = await client()
    .from('hupaak_campaigns')
    .update({
      name: input.name.trim(),
      remarks: input.remarks.trim(),
      config: input.config,
      expiry_date: input.expiryDate,
      on_days: input.onDays,
      compulsory_days: input.compulsoryDays,
    })
    .eq('id', campaignId)
  fail(error)
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { error } = await client().from('hupaak_campaigns').delete().eq('id', campaignId)
  fail(error)
}

export async function setSavedSlots(campaignId: string, savedSlots: string[]): Promise<void> {
  const { error } = await client().from('hupaak_campaigns').update({ saved_slots: savedSlots }).eq('id', campaignId)
  fail(error)
}

async function replaceBlocks(personId: string, blocks: TimeBlock[]): Promise<void> {
  const db = client()
  const existing = await db.from('hupaak_blocks').select('id').eq('person_id', personId)
  fail(existing.error)
  if (blocks.length) {
    const inserted = await db.from('hupaak_blocks').insert(
      blocks.map((block) => ({
        id: crypto.randomUUID(),
        person_id: personId,
        kind: block.kind satisfies BlockKind,
        starts_at: block.start.toISOString(),
        ends_at: block.end.toISOString(),
        whole_day: block.wholeDay,
      })),
    )
    fail(inserted.error)
  }
  const oldIds = ((existing.data ?? []) as { id: string }[]).map((row) => row.id)
  if (oldIds.length) {
    const deleted = await db.from('hupaak_blocks').delete().in('id', oldIds)
    fail(deleted.error)
  }
}

export async function savePortalPerson(input: {
  campaignId: string
  userId: string
  email: string
  name: string
  role: PersonRole
  blocks: TimeBlock[]
}): Promise<void> {
  const db = client()
  const existing = await db
    .from('hupaak_people')
    .select('id')
    .eq('campaign_id', input.campaignId)
    .eq('user_id', input.userId)
    .maybeSingle()
  fail(existing.error)

  let personId = (existing.data as { id: string } | null)?.id
  if (!personId) {
    const inserted = await db
      .from('hupaak_people')
      .insert({
        campaign_id: input.campaignId,
        user_id: input.userId,
        name: input.name.trim(),
        email: input.email.toLowerCase(),
        role: input.role,
        last_updated: new Date().toISOString(),
      })
      .select('id')
      .single()
    fail(inserted.error)
    personId = (inserted.data as { id: string }).id
  } else {
    const updated = await db
      .from('hupaak_people')
      .update({
        name: input.name.trim(),
        email: input.email.toLowerCase(),
        last_updated: new Date().toISOString(),
      })
      .eq('id', personId)
    fail(updated.error)
  }
  await replaceBlocks(personId, input.blocks)
}

export async function saveRosterPerson(input: {
  campaignId: string
  personId?: string
  name: string
  role: PersonRole
  blocks: TimeBlock[]
}): Promise<void> {
  const db = client()
  let personId = input.personId
  if (!personId) {
    const inserted = await db
      .from('hupaak_people')
      .insert({
        campaign_id: input.campaignId,
        name: input.name.trim(),
        role: input.role,
        email: '',
        last_updated: new Date().toISOString(),
      })
      .select('id')
      .single()
    fail(inserted.error)
    personId = (inserted.data as { id: string }).id
  } else {
    const updated = await db
      .from('hupaak_people')
      .update({ name: input.name.trim(), last_updated: new Date().toISOString() })
      .eq('id', personId)
    fail(updated.error)
  }
  await replaceBlocks(personId, input.blocks)
}

export async function deletePerson(personId: string): Promise<void> {
  const { error } = await client().from('hupaak_people').delete().eq('id', personId)
  fail(error)
}

export async function createDanceGroup(campaignId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const db = client()
  const existing = await db
    .from('hupaak_groups')
    .select('position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: false })
    .limit(1)
  fail(existing.error)
  const position = ((existing.data?.[0] as { position: number } | undefined)?.position ?? -1) + 1
  const inserted = await db.from('hupaak_groups').insert({ campaign_id: campaignId, name: trimmed, position })
  fail(inserted.error)
}

export async function renameDanceGroup(groupId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const { error } = await client().from('hupaak_groups').update({ name: trimmed }).eq('id', groupId)
  fail(error)
}

export async function deleteDanceGroup(groupId: string): Promise<void> {
  const { error } = await client().from('hupaak_groups').delete().eq('id', groupId)
  fail(error)
}

export async function setDanceGroupMember(groupId: string, personId: string, included: boolean): Promise<void> {
  const db = client()
  if (!included) {
    const { error } = await db.from('hupaak_group_members').delete().eq('group_id', groupId).eq('person_id', personId)
    fail(error)
    return
  }
  const { error } = await db.from('hupaak_group_members').upsert(
    { group_id: groupId, person_id: personId },
    { onConflict: 'group_id,person_id' },
  )
  fail(error)
}
