/**
 * Pure RFC 5545 iCalendar (iMIP) generator for meeting invitations.
 * Outputs CRLF (\r\n) formatted VCALENDAR/VEVENT strings compatible with
 * Zoho Calendar, Google Calendar, Apple Calendar, and Microsoft Outlook.
 */

export type IcalAttendee = {
  email: string
  name?: string
  role?: "REQ-PARTICIPANT" | "OPT-PARTICIPANT" | "NON-PARTICIPANT"
  partstat?: "NEEDS-ACTION" | "ACCEPTED" | "TENTATIVE" | "DECLINED"
  rsvp?: boolean
}

export type IcalEventInput = {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  location?: string | null
  organizer?: { name?: string; email: string }
  attendees?: IcalAttendee[]
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED"
  method?: "REQUEST" | "CANCEL"
  sequence?: number
  now?: Date
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function formatUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

export function buildIcalendarEvent(input: IcalEventInput): string {
  const method = input.method ?? "REQUEST"
  const status = input.status ?? "CONFIRMED"
  const sequence = input.sequence ?? 0
  const now = input.now ?? new Date()

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Bonyan Engineering//Design Consultation//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
  ]

  if (input.description) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`)
  }

  if (input.location) {
    lines.push(`LOCATION:${escapeText(input.location)}`)
  }

  if (input.organizer) {
    const cn = input.organizer.name ? `;CN="${escapeText(input.organizer.name)}"` : ""
    lines.push(`ORGANIZER${cn}:mailto:${input.organizer.email.trim()}`)
  }

  for (const att of input.attendees ?? []) {
    const parts = ["ATTENDEE;CUTYPE=INDIVIDUAL"]
    if (att.role) parts.push(`ROLE=${att.role}`)
    if (att.partstat) parts.push(`PARTSTAT=${att.partstat}`)
    if (att.rsvp !== undefined) parts.push(`RSVP=${att.rsvp ? "TRUE" : "FALSE"}`)
    if (att.name) parts.push(`CN="${escapeText(att.name)}"`)
    lines.push(`${parts.join(";")}:mailto:${att.email.trim()}`)
  }

  lines.push(`STATUS:${status}`)
  lines.push(`SEQUENCE:${sequence}`)
  lines.push("END:VEVENT")
  lines.push("END:VCALENDAR")

  return lines.join("\r\n") + "\r\n"
}
