import { describe, expect, test, vi } from "vitest"
import {
  resolveZohoEmailConfig,
  sendBookingNotifications,
  type BookingEmailDetails,
  type ZohoEmailConfig,
} from "./zoho-email"

describe("resolveZohoEmailConfig", () => {
  test("returns null if no password is set", () => {
    expect(resolveZohoEmailConfig({})).toBeNull()
    expect(resolveZohoEmailConfig({ ZOHO_SMTP_USER: "info@bonyanec.com" })).toBeNull()
  })

  test("resolves config with ZOHO_SMTP_PASSWORD or ZOHO_APP_PASSWORD", () => {
    const config1 = resolveZohoEmailConfig({
      ZOHO_SMTP_USER: "info@bonyanec.com",
      ZOHO_SMTP_PASSWORD: "app-password-123",
      BOOKING_NOTIFICATION_EMAIL: "architecture1@bonyanec.com",
    })
    expect(config1).toEqual({
      host: "smtppro.zoho.com",
      port: 465,
      secure: true,
      user: "info@bonyanec.com",
      pass: "app-password-123",
      from: '"Bonyan Engineering" <info@bonyanec.com>',
      attendeeEmail: "architecture1@bonyanec.com",
    })

    const config2 = resolveZohoEmailConfig({
      ZOHO_USER: "info@bonyanec.com",
      ZOHO_APP_PASSWORD: "secret-password",
    })
    expect(config2?.pass).toBe("secret-password")
    expect(config2?.attendeeEmail).toBe("architecture1@bonyanec.com")
  })
})

describe("sendBookingNotifications", () => {
  const dummyConfig: ZohoEmailConfig = {
    host: "smtppro.zoho.com",
    port: 465,
    secure: true,
    user: "info@bonyanec.com",
    pass: "fake-pass",
    from: '"Bonyan Engineering" <info@bonyanec.com>',
    attendeeEmail: "architecture1@bonyanec.com",
  }

  const sampleBooking: BookingEmailDetails = {
    requestId: "11111111-2222-3333-4444-555555555555",
    clientName: "Salim Al-Harthy",
    whatsappPhone: "96891234567",
    clientEmail: "salim@example.com",
    meetingMode: "office",
    startsAt: "2026-11-20T06:00:00Z",
    endsAt: "2026-11-20T06:45:00Z",
    timeZone: "Asia/Muscat",
    designCode: "BD-101",
    designTitleAr: "فيلا مودرن",
    designTitleEn: "Modern Villa",
    path: "same",
    projectType: "villa",
    landStatus: "owned_ready",
    wilayat: "muscat_seeb",
    landAreaSqm: 600,
    startTimeline: "within_3_months",
    ideaText: "Looking forward to meeting",
    locale: "ar",
  }

  test("sends invitation email with .ics to attendee and confirmation with .ics to client", async () => {
    const sentMails: any[] = []
    const fakeTransporter = {
      sendMail: vi.fn(async (options: any) => {
        sentMails.push(options)
        return { messageId: `msg-${sentMails.length}` }
      }),
    }

    const result = await sendBookingNotifications(
      sampleBooking,
      dummyConfig,
      () => fakeTransporter as any,
    )

    expect(result.ok).toBe(true)
    expect(result.sentToAttendee).toBe(true)
    expect(result.sentToClient).toBe(true)
    expect(sentMails).toHaveLength(2)

    // Attendee mail
    const attendeeMail = sentMails[0]
    expect(attendeeMail.to).toBe("architecture1@bonyanec.com")
    expect(attendeeMail.subject).toContain("Salim Al-Harthy")
    expect(attendeeMail.icalEvent).toBeDefined()
    expect(attendeeMail.icalEvent.method).toBe("REQUEST")
    expect(attendeeMail.icalEvent.content).toContain("BEGIN:VCALENDAR")
    expect(attendeeMail.icalEvent.content).toContain("UID:booking-11111111-2222-3333-4444-555555555555@bonyanec.com")

    // Client mail
    const clientMail = sentMails[1]
    expect(clientMail.to).toBe("salim@example.com")
    expect(clientMail.subject).toContain("تأكيد موعد استشارة التصميم")
    expect(clientMail.icalEvent).toBeDefined()
    expect(clientMail.icalEvent.method).toBe("REQUEST")
  })

  test("sends notification without ics when mode is call_me", async () => {
    const sentMails: any[] = []
    const fakeTransporter = {
      sendMail: vi.fn(async (options: any) => {
        sentMails.push(options)
        return { messageId: `msg-${sentMails.length}` }
      }),
    }

    const callMeBooking: BookingEmailDetails = {
      ...sampleBooking,
      meetingMode: "call_me",
      startsAt: null,
      endsAt: null,
    }

    const result = await sendBookingNotifications(
      callMeBooking,
      dummyConfig,
      () => fakeTransporter as any,
    )

    expect(result.ok).toBe(true)
    expect(sentMails).toHaveLength(2)
    expect(sentMails[0].icalEvent).toBeUndefined()
    expect(sentMails[1].icalEvent).toBeUndefined()
    expect(sentMails[0].subject).toContain("طلب اتصال جديد")
    expect(sentMails[1].subject).toContain("تم استلام طلبك للتواصل")
  })
})
