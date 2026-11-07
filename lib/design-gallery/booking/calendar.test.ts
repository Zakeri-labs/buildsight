import { describe, expect, test, vi } from "vitest"
import { CalendarError, googleCalendarProvider } from "./calendar"

const env = {
  GOOGLE_CALENDAR_CLIENT_ID: "id",
  GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh",
  GOOGLE_CALENDAR_ID: "team@bonyanec.com",
}

function fakeGoogle(responses: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(responses).find((k) => url.includes(k))!
    const { status = 200, body } = responses[key]
    return new Response(JSON.stringify(body), { status })
  })
  return { calls, fetchImpl }
}

test("without credentials the calendar is not connected", () => {
  expect(googleCalendarProvider({})).toEqual({ connected: false })
  expect(googleCalendarProvider({ ...env, GOOGLE_CALENDAR_REFRESH_TOKEN: "" })).toEqual({ connected: false })
})

describe("connected", () => {
  test("reads busy times of the team calendar", async () => {
    const { fetchImpl, calls } = fakeGoogle({
      "oauth2.googleapis.com/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/freeBusy": { body: { calendars: { "team@bonyanec.com": { busy: [{ start: "2026-10-25T05:00:00Z", end: "2026-10-25T06:00:00Z" }] } } } },
    })
    const calendar = googleCalendarProvider(env, fetchImpl)
    if (!calendar.connected) throw new Error("expected connected")
    expect(await calendar.busy(new Date("2026-10-21T00:00:00Z"), new Date("2026-11-11T00:00:00Z"))).toEqual([
      { start: new Date("2026-10-25T05:00:00Z"), end: new Date("2026-10-25T06:00:00Z") },
    ])
    expect(calls[1].init.headers).toMatchObject({ Authorization: "Bearer tok" })
    // The token is reused while valid.
    await calendar.busy(new Date(), new Date())
    expect(calls.filter((c) => c.url.includes("token"))).toHaveLength(1)
  })

  test("creates an event with a Meet link and invites the client", async () => {
    const { fetchImpl, calls } = fakeGoogle({
      "oauth2.googleapis.com/token": { body: { access_token: "tok" } },
      "/events": { body: { id: "evt1", hangoutLink: "https://meet.google.com/abc-defg-hij" } },
    })
    const calendar = googleCalendarProvider(env, fetchImpl)
    if (!calendar.connected) throw new Error("expected connected")
    const result = await calendar.createEvent({
      start: new Date("2026-10-27T06:30:00Z"),
      end: new Date("2026-10-27T07:15:00Z"),
      summary: "Meeting",
      description: "Design BD-101",
      location: null,
      attendeeEmail: "ahmed@example.com",
      withMeet: true,
      requestId: "req-1",
    })
    expect(result).toEqual({ eventId: "evt1", meetLink: "https://meet.google.com/abc-defg-hij" })
    expect(calls[1].url).toContain("/calendars/team%40bonyanec.com/events?conferenceDataVersion=1&sendUpdates=all")
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
      attendees: [{ email: "ahmed@example.com" }],
      conferenceData: { createRequest: { requestId: "req-1", conferenceSolutionKey: { type: "hangoutsMeet" } } },
    })
  })

  test("an office meeting has no Meet; a strange link is never trusted", async () => {
    const { fetchImpl, calls } = fakeGoogle({
      "oauth2.googleapis.com/token": { body: { access_token: "tok" } },
      "/events": { body: { id: "evt2", hangoutLink: "https://evil.example/x" } },
    })
    const calendar = googleCalendarProvider(env, fetchImpl)
    if (!calendar.connected) throw new Error("expected connected")
    const result = await calendar.createEvent({
      start: new Date(),
      end: new Date(),
      summary: "s",
      description: "d",
      location: "Mabela",
      attendeeEmail: null,
      withMeet: false,
      requestId: "r",
    })
    expect(result.meetLink).toBeNull()
    expect(JSON.parse(String(calls[1].init.body)).conferenceData).toBeUndefined()
  })

  test("errors from Google become CalendarError", async () => {
    const { fetchImpl } = fakeGoogle({ "oauth2.googleapis.com/token": { status: 400, body: { error: "invalid_grant" } } })
    const calendar = googleCalendarProvider(env, fetchImpl)
    if (!calendar.connected) throw new Error("expected connected")
    await expect(calendar.busy(new Date(), new Date())).rejects.toThrow(CalendarError)
    await expect(calendar.busy(new Date(), new Date())).rejects.toThrow("invalid_grant")
  })
})
