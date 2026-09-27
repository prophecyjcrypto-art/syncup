export type Language = 'en' | 'zh'
export type BlockKind = 'available' | 'unavailable'
export type PersonRole = 'choreographer' | 'dancer'
export type AppStep =
  | 'login'
  | 'campaigns'
  | 'setup'
  | 'choreographers'
  | 'dancers'
  | 'results'
  | 'portal'

export interface AppConfig {
  startDate: string
  endDate: string
  durationHours: number
  dayStartHour: number
  dayEndHour: number
  attendanceTolerance: number
}

export interface TimeBlock {
  id: string
  kind: BlockKind
  start: Date
  end: Date
  wholeDay: boolean
}

export interface Person {
  id: string
  userId: string | null
  name: string
  email: string
  role: PersonRole
  blocks: TimeBlock[]
  lastUpdated: string | null
}

export interface CampaignAdmin {
  id: string
  userId: string | null
  email: string
}

export interface Campaign {
  id: string
  ownerId: string
  name: string
  remarks: string
  config: AppConfig
  expiryDate: string
  onDays: string[]
  compulsoryDays: string[]
  savedSlots: string[]
  createdAt: string
  adminCode: string | null
  admins: CampaignAdmin[]
  choreographers: Person[]
  dancers: Person[]
}

export interface CampaignInput {
  name: string
  remarks: string
  config: AppConfig
  expiryDate: string
  onDays: string[]
  compulsoryDays: string[]
}

export interface PartialMember {
  id: string
  missingMins: number
  lateMins: number
  earlyMins: number
}

export interface TimeSlot {
  start: Date
  end: Date
  availableMembers: string[]
  partialMembers: PartialMember[]
  unavailableMembers: { id: string; availability: number }[]
  attendanceScore: number
  score: number
}
