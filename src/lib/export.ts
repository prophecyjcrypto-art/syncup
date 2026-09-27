import type { Person, TimeSlot } from '../types'
import { formatLongDate, formatTime } from './dates'

function personName(people: Person[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? 'Unknown'
}

export function formatSlotText(slot: TimeSlot, detailed: boolean, people: Person[], lang: 'en' | 'zh'): string {
  const when = `${formatLongDate(slot.start, lang)} ${formatTime(slot.start, lang)} – ${formatTime(slot.end, lang)}`
  if (!detailed) return when

  const full = slot.availableMembers.map((id) => personName(people, id))
  const partial = slot.partialMembers.map((member) => {
    const notes: string[] = []
    if (member.lateMins > 0) notes.push(`late ${member.lateMins}m`)
    if (member.earlyMins > 0) notes.push(`early ${member.earlyMins}m`)
    if (notes.length === 0) notes.push(`missing ${member.missingMins}m`)
    return `${personName(people, member.id)} (${notes.join(', ')})`
  })
  const attending = full.length + partial.length
  return `${when}\nAttending ${attending}/${people.length}:\n${[...full, ...partial].join('\n') || '-'}`
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function buildIcs(slots: TimeSlot[], campaignName: string, remarks: string, people: Person[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SyncUp//Scheduler//EN', 'CALSCALE:GREGORIAN']
  slots.forEach((slot, index) => {
    const description = [
      remarks.trim() ? remarks.trim() : '',
      formatSlotText(slot, true, people, 'en'),
    ]
      .filter(Boolean)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsStamp(slot.start)}-${index}@syncup`,
      `DTSTART:${icsStamp(slot.start)}`,
      `DTEND:${icsStamp(slot.end)}`,
      `SUMMARY:${icsEscape(slots.length > 1 ? `${campaignName} (${index + 1})` : campaignName)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
