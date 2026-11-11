import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppConfig, BlockKind, Campaign, CampaignInput, Person, PersonRole, TimeBlock } from '../types'
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

function mapCampaign(row: CampaignRow, adminCode: string | null): Campaign {
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
    adminCode,
    admins: (row.admins ?? [])
      .map((admin) => ({ id: admin.id, userId: admin.user_id, email: admin.email }))
      .sort((left, right) => left.email.localeCompare(right.email)),
    choreographers: people.filter((person) => person.role === 'choreographer'),
    dancers: people.filter((person) => person.role === 'dancer'),
  }
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const db = client()
  const { data, error } = await db.from('hupaak_campaigns').select(campaignSelect).order('created_at', { ascending: false })
  fail(error)
  const invites = await db.from('hupaak_admin_invites').select('campaign_id, code')
  fail(invites.error)
  const codes = new Map(
    ((invites.data ?? []) as { campaign_id: string; code: string }[]).map((invite) => [invite.campaign_id, invite.code]),
  )
  return ((data ?? []) as CampaignRow[]).map((row) => mapCampaign(row, codes.get(row.id) ?? null))
}

export async function ensureAccess(campaignId: string, userId: string): Promise<boolean> {
  const { error } = await client().from('hupaak_access').insert({ campaign_id: campaignId, user_id: userId })
  if (!error || error.code === '23505') return true
  if (error.code === '23503') return false
  throw new Error(error.message)
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
