import type { Interval } from "./slots"

/**
 * The team calendar used for bookings. With Google credentials it reads busy
 * times (freeBusy) and creates events with a Google Meet link and an
 * invitation to the client. Without credentials ("not connected") nothing
 * is read or created: bookings are still saved, and only existing bookings
 * block a time slot.
 *
 * Configuration (server environment, one shared team calendar):
 *   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
 *   GOOGLE_CALENDAR_REFRESH_TOKEN, GOOGLE_CALENDAR_ID (default "primary").
 */
export type CalendarEventInput = {
  start: Date
  end: Date
  summary: string
  description: string
  location: string | null
  attendeeEmail: string | null
  withMeet: boolean
  /** Stable id so a retried request does not create a second Meet. */
  requestId: string
}

export type CalendarProvider =
  | { connected: false }
  | {
      connected: true
      busy(from: Date, to: Date): Promise<Interval[]>
      createEvent(input: CalendarEventInput): Promise<{ eventId: string; meetLink: string | null }>
    }

type Env = Record<string, string | undefined>
type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API = "https://www.googleapis.com/calendar/v3"
const TIMEOUT_MS = 8000

export class CalendarError extends Error {}

export function googleCalendarProvider(env: Env = process.env, fetchImpl: FetchLike = fetch): CalendarProvider {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET
  const refreshToken = env.GOOGLE_CALENDAR_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return { connected: false }
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim() || "primary"

  let cached: { token: string; expiresAt: number } | null = null
  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: refreshToken!,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
    if (!response.ok || !body.access_token) throw new CalendarError(`token: ${body.error ?? response.status}`)
    cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
    return cached.token
  }

  async function call<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } }
    if (!response.ok) throw new CalendarError(`${path.split("?")[0]}: ${json.error?.message ?? response.status}`)
    return json
  }

  return {
    connected: true,
    async busy(from, to) {
      const result = await call<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
        "/freeBusy",
        { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] },
      )
      const calendar = result.calendars?.[calendarId]
      if (!calendar || calendar.errors?.length) throw new CalendarError("freeBusy: calendar not readable")
      return (calendar.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    },
    async createEvent(input) {
      const event = await call<{ id?: string; hangoutLink?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
        {
          summary: input.summary,
          description: input.description,
          location: input.location ?? undefined,
          start: { dateTime: input.start.toISOString() },
          end: { dateTime: input.end.toISOString() },
          attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
          conferenceData: input.withMeet
            ? { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } }
            : undefined,
        },
      )
      if (!event.id) throw new CalendarError("events.insert: no event id")
      const meetLink = event.hangoutLink && /^https:\/\/meet\.google\.com\//.test(event.hangoutLink) ? event.hangoutLink : null
      return { eventId: event.id, meetLink }
    },
  }
}
