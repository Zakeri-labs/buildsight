import { describe, expect, test } from "vitest"
import { buildIcalendarEvent } from "./ics"

describe("buildIcalendarEvent", () => {
  const start = new Date("2026-11-20T10:00:00Z")
  const end = new Date("2026-11-20T10:45:00Z")
  const fixedNow = new Date("2026-11-11T12:00:00Z")

  test("generates basic RFC 5545 calendar string with CRLF line endings", () => {
    const ics = buildIcalendarEvent({
      uid: "req-123@bonyanec.com",
      start,
      end,
      summary: "Design Consultation",
      now: fixedNow,
    })

    expect(ics).toContain("BEGIN:VCALENDAR\r\n")
    expect(ics).toContain("METHOD:REQUEST\r\n")
    expect(ics).toContain("BEGIN:VEVENT\r\n")
    expect(ics).toContain("UID:req-123@bonyanec.com\r\n")
    expect(ics).toContain("DTSTAMP:20261111T120000Z\r\n")
    expect(ics).toContain("DTSTART:20261120T100000Z\r\n")
    expect(ics).toContain("DTEND:20261120T104500Z\r\n")
    expect(ics).toContain("SUMMARY:Design Consultation\r\n")
    expect(ics).toContain("STATUS:CONFIRMED\r\n")
    expect(ics).toContain("END:VEVENT\r\n")
    expect(ics).toContain("END:VCALENDAR\r\n")
  })

  test("escapes special characters (semicolons, commas, newlines, backslashes)", () => {
    const ics = buildIcalendarEvent({
      uid: "req-456@bonyanec.com",
      start,
      end,
      summary: "Villa 101; with pool, garden",
      description: "Line 1\nLine 2; detail, test\\sample",
      location: "Office; Floor 2, Room 3",
      now: fixedNow,
    })

    expect(ics).toContain("SUMMARY:Villa 101\\; with pool\\, garden\r\n")
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\; detail\\, test\\\\sample\r\n")
    expect(ics).toContain("LOCATION:Office\\; Floor 2\\, Room 3\r\n")
  })

  test("formats organizer and attendees correctly for Zoho and client calendars", () => {
    const ics = buildIcalendarEvent({
      uid: "meeting-789@bonyanec.com",
      start,
      end,
      summary: "Meeting with Ahmed",
      organizer: { name: "Bonyan Engineering", email: "info@bonyanec.com" },
      attendees: [
        {
          email: "architecture1@bonyanec.com",
          name: "Mrs. Al Hajri",
          role: "REQ-PARTICIPANT",
          partstat: "ACCEPTED",
        },
        {
          email: "ahmed@example.com",
          name: "Ahmed",
          role: "REQ-PARTICIPANT",
          partstat: "NEEDS-ACTION",
          rsvp: true,
        },
      ],
      now: fixedNow,
    })

    expect(ics).toContain('ORGANIZER;CN="Bonyan Engineering":mailto:info@bonyanec.com\r\n')
    expect(ics).toContain(
      'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Mrs. Al Hajri":mailto:architecture1@bonyanec.com\r\n',
    )
    expect(ics).toContain(
      'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Ahmed":mailto:ahmed@example.com\r\n',
    )
  })
})
