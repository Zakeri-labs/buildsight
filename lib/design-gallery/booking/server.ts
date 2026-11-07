import "server-only"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { detectProjectImageMimeType } from "@/lib/projects/project-image"
import { createAdminClient } from "@/lib/supabase/admin"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { findPublicDesign, loadPublicSite, type PublicDesignRef, type PublicSite } from "../public"
import { createRateLimiter } from "../rate-limit"
import { googleCalendarProvider, type CalendarProvider } from "./calendar"
import { availableDays, findOfferedSlot, type BookingDay, type Interval } from "./slots"
import { IDEA_FILE_MAX_BYTES, IDEA_FILE_MAX_COUNT, IDEA_FILE_TYPES, type MeetingRequestInput } from "./types"
import { looksAutomated, validateMeetingRequest, type BookingFieldError } from "./validation"
import { findWilayat } from "./wilayat"

export const MEETING_FILES_BUCKET = "design-meeting-files"

export type BookingError =
  | "unavailable" // no gallery for this host
  | "invalid" // see fieldErrors
  | "designNotBookable"
  | "slotTaken" // the time is no longer free
  | "tooMany" // rate limit
  | "failed"

export type BookingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BookingError; fieldErrors?: Partial<Record<string, BookingFieldError>> }

export type BookingConfirmation = {
  mode: MeetingRequestInput["meetingMode"]
  startsAt: string | null
  timeZone: string
  meetLink: string | null
  /** True when the team calendar received the event (and the client an invitation). */
  calendarInvite: boolean
  officeAddressAr: string | null
  officeAddressEn: string | null
}

/** Uploads allowed into one request's folder: the files sent plus a few replaced ones. */
export const IDEA_UPLOADS_PER_REQUEST = IDEA_FILE_MAX_COUNT * 2

// Per server instance: slows down floods from one address.
const submitLimit = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 })
const uploadLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60_000 })

async function clientAddress(): Promise<string> {
  const h = await headers()
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown"
}

/** Meetings already booked (not cancelled) between two instants: they block those slots. */
async function bookedIntervals(organizationId: string, from: Date, to: Date): Promise<Interval[]> {
  const { data, error } = await createAdminClient()
    .from("design_meeting_requests")
    .select("starts_at, ends_at")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
  if (error) throw error
  return (data ?? []).map((row: { starts_at: string; ends_at: string }) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) }))
}

/**
 * Everything that blocks a slot: existing bookings and, when connected, the
 * team calendar. If the calendar cannot be read, bookings alone decide (the
 * failure is logged) rather than closing all booking.
 */
async function busyIntervals(site: PublicSite, calendar: CalendarProvider, now: Date): Promise<Interval[]> {
  const to = new Date(now.getTime() + (site.site.booking.daysAhead + 1) * 86_400_000)
  const booked = await bookedIntervals(site.site.organizationId, now, to)
  if (!calendar.connected) return booked
  try {
    return [...booked, ...(await calendar.busy(now, to))]
  } catch (error) {
    console.error("design booking: team calendar not readable:", error instanceof Error ? error.message : error)
    return booked
  }
}

export async function getAvailability(now = new Date()): Promise<BookingResult<{ days: BookingDay[]; timeZone: string }>> {
  try {
    const site = await loadPublicSite()
    if (!site) return { ok: false, error: "unavailable" }
    const busy = await busyIntervals(site, googleCalendarProvider(), now)
    return { ok: true, data: { days: availableDays(site.site.booking, now, busy), timeZone: site.site.booking.timeZone } }
  } catch (error) {
    console.error("design booking: availability failed:", error instanceof Error ? error.message : error)
    return { ok: false, error: "failed" }
  }
}

function extensionFor(type: string): string {
  return type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
}

function detectFileType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf"
  return detectProjectImageMimeType(bytes)
}

/** Signed upload for one file sent with an idea, into the request's own private folder. */
export async function prepareIdeaUpload(input: {
  requestKey: string
  name: string
  size: number
  type: string
}): Promise<BookingResult<{ storagePath: string; token: string }>> {
  try {
    if (!uploadLimit(await clientAddress())) return { ok: false, error: "tooMany" }
    const site = await loadPublicSite()
    if (!site) return { ok: false, error: "unavailable" }
    const key = String(input?.requestKey ?? "").toLowerCase()
    const type = String(input?.type ?? "").toLowerCase()
    const size = Number(input?.size ?? 0)
    if (!/^[0-9a-f-]{36}$/.test(key)) return { ok: false, error: "invalid" }
    if (!(IDEA_FILE_TYPES as readonly string[]).includes(type) || !(size > 0) || size > IDEA_FILE_MAX_BYTES) {
      return { ok: false, error: "invalid", fieldErrors: { attachmentPaths: "invalidChoice" } }
    }

    // Files belong to a form not yet sent: once the request is saved, its folder is closed.
    const { data: saved } = await createAdminClient()
      .from("design_meeting_requests")
      .select("id")
      .eq("organization_id", site.site.organizationId)
      .eq("request_key", key)
      .maybeSingle()
    if (saved) return { ok: false, error: "invalid" }

    const folder = `${site.site.organizationId}/${key}`
    const bucket = createAdminClient().storage.from(MEETING_FILES_BUCKET)
    const { data: existing } = await bucket.list(folder, { limit: 10 })
    if ((existing ?? []).length >= IDEA_UPLOADS_PER_REQUEST) {
      return { ok: false, error: "invalid", fieldErrors: { attachmentPaths: "tooManyFiles" } }
    }
    const storagePath = `${folder}/${randomUUID()}.${extensionFor(type)}`
    const { data, error } = await bucket.createSignedUploadUrl(storagePath)
    if (error || !data?.token) return { ok: false, error: "failed" }
    return { ok: true, data: { storagePath, token: data.token } }
  } catch (error) {
    console.error("design booking: upload prepare failed:", error instanceof Error ? error.message : error)
    return { ok: false, error: "failed" }
  }
}

const LABELS = dictionaries.ar.designGalleryPublic.booking

function summaryText(input: MeetingRequestInput, design: PublicDesignRef | null): { summary: string; description: string } {
  const wilayat = input.wilayat?.startsWith("other:") ? input.wilayat.slice(6) : findWilayat(input.wilayat)?.ar ?? ""
  const lines = [
    `العميل: ${input.clientName} · واتساب +${input.whatsappPhone}`,
    input.email ? `البريد: ${input.email}` : null,
    design ? `التصميم: ${design.titleAr} (${design.code})${input.path === "modified" ? " — مع تعديلات" : ""}` : "فكرة جديدة",
    input.ideaText ? `الفكرة: ${input.ideaText}` : null,
    `المشروع: ${LABELS.projectTypes[input.projectType]}${wilayat ? ` · ${wilayat}` : ""}${input.landAreaSqm ? ` · ${input.landAreaSqm} م²` : ""}`,
    `الأرض: ${LABELS.landStatuses[input.landStatus]} · البدء: ${LABELS.timelines[input.startTimeline]}`,
  ].filter(Boolean)
  return {
    summary: `اجتماع تصميم — ${input.clientName}${design ? ` — ${design.code}` : ""}`,
    description: lines.join("\n"),
  }
}

type CheckedFile = { path: string; type: string; size: number }

/** Storage answers "not found" for a path that was never uploaded; anything else may be temporary. */
function isMissingObject(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: string | number; message?: string } | null
  return Number(e?.status ?? e?.statusCode) === 404 || /not.?found/i.test(e?.message ?? "")
}

/**
 * Checks the files listed by the form before anything is saved: only files in
 * this request's own folder whose bytes really are an image or a PDF are
 * kept; a fake is deleted. If a file cannot be read right now, nothing is
 * saved and the visitor can send again (the file is kept).
 */
async function checkIdeaFiles(organizationId: string, input: MeetingRequestInput): Promise<CheckedFile[] | "retry"> {
  if (input.path !== "idea" || !input.attachmentPaths.length) return []
  const bucket = createAdminClient().storage.from(MEETING_FILES_BUCKET)
  const prefix = `${organizationId}/${input.requestKey}/`
  const files: CheckedFile[] = []
  for (const path of input.attachmentPaths) {
    if (!path.startsWith(prefix)) continue
    const { data: file, error } = await bucket.download(path)
    if (error || !file) {
      if (isMissingObject(error)) continue
      console.error("design booking: file not readable:", path, (error as { message?: string } | null)?.message)
      return "retry"
    }
    const type = detectFileType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
    if (!type || file.size <= 0 || file.size > IDEA_FILE_MAX_BYTES) {
      const { error: removeError } = await bucket.remove([path])
      if (removeError) console.error("design booking: rejected file not removed:", path, removeError.message)
      continue
    }
    files.push({ path, type, size: file.size })
  }
  return files
}

/**
 * Records the checked files on the saved request. A file whose record cannot
 * be saved is kept in storage (and logged), never deleted. Files uploaded
 * into the folder but removed from the form by the visitor are deleted.
 */
async function attachIdeaFiles(organizationId: string, requestId: string, input: MeetingRequestInput, files: CheckedFile[]) {
  const admin = createAdminClient()
  for (const file of files) {
    const { error } = await admin.from("design_meeting_attachments").insert({
      organization_id: organizationId,
      request_id: requestId,
      storage_path: file.path,
      content_type: file.type,
      size_bytes: file.size,
    })
    if (error && error.code !== "23505") console.error("design booking: file not attached (kept in storage):", file.path, error.message)
  }
  try {
    const folder = `${organizationId}/${input.requestKey}`
    const listed = new Set(input.path === "idea" ? input.attachmentPaths : [])
    const bucket = admin.storage.from(MEETING_FILES_BUCKET)
    const { data: inFolder } = await bucket.list(folder, { limit: 100 })
    const removed = (inFolder ?? []).map((f: { name: string }) => `${folder}/${f.name.split("/").pop()}`).filter((p) => !listed.has(p))
    if (removed.length) await bucket.remove(removed)
  } catch (error) {
    console.error("design booking: removed files not deleted:", error instanceof Error ? error.message : error)
  }
}

/** At most this many requests per WhatsApp number per day (all server instances: counted in the database). */
export const REQUESTS_PER_PHONE_PER_DAY = 3

/**
 * Saves a booking or "call me" request from the public form, then attaches
 * the idea files and (best effort) creates the calendar event. The request
 * itself is never lost because the calendar failed.
 */
export async function submitMeetingRequest(
  raw: Record<string, unknown>,
  now = new Date(),
): Promise<BookingResult<BookingConfirmation>> {
  try {
    if (looksAutomated(raw)) return { ok: false, error: "failed" }
    const parsed = validateMeetingRequest(raw)
    if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors }
    const input = parsed.value

    const site = await loadPublicSite()
    if (!site) return { ok: false, error: "unavailable" }
    const org = site.site.organizationId
    const admin = createAdminClient()
    const confirmation = (row: SavedRow): BookingConfirmation => ({
      mode: row.meeting_mode as BookingConfirmation["mode"],
      startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
      timeZone: site.site.booking.timeZone,
      meetLink: row.meet_link,
      // Only when the client was really invited (an email was given).
      calendarInvite: row.calendar_status === "created" && Boolean(row.email),
      officeAddressAr: site.site.officeAddressAr,
      officeAddressEn: site.site.officeAddressEn,
    })

    // The same form sent again (double click, retry): answer with what was saved.
    const columns = "id, meeting_mode, starts_at, meet_link, calendar_status, email"
    const { data: existing } = await admin
      .from("design_meeting_requests")
      .select(columns)
      .eq("organization_id", org)
      .eq("request_key", input.requestKey)
      .maybeSingle()
    if (existing) return { ok: true, data: confirmation(existing) }

    if (!submitLimit(await clientAddress())) return { ok: false, error: "tooMany" }
    const { data: samePhone, error: phoneError } = await admin
      .from("design_meeting_requests")
      .select("id")
      .eq("organization_id", org)
      .eq("whatsapp_phone", input.whatsappPhone)
      .gte("created_at", new Date(now.getTime() - 86_400_000).toISOString())
      .limit(REQUESTS_PER_PHONE_PER_DAY)
    if (phoneError) throw phoneError
    if ((samePhone ?? []).length >= REQUESTS_PER_PHONE_PER_DAY) return { ok: false, error: "tooMany" }

    const design = input.designSlug ? await findPublicDesign(org, input.designSlug) : null
    if (input.path !== "idea" && (!design || !design.isBookable)) return { ok: false, error: "designNotBookable" }

    const files = await checkIdeaFiles(org, input)
    if (files === "retry") return { ok: false, error: "failed" }
    if (input.path === "idea" && !input.ideaText && files.length === 0) {
      return { ok: false, error: "invalid", fieldErrors: { ideaText: "ideaNeeded" } }
    }

    const calendar = googleCalendarProvider()
    let slot: { start: string; end: string } | null = null
    if (input.meetingMode !== "call_me") {
      slot = findOfferedSlot(site.site.booking, now, await busyIntervals(site, calendar, now), input.slotStart!)
      if (!slot) return { ok: false, error: "slotTaken" }
    }

    const { data: inserted, error: insertError } = await admin
      .from("design_meeting_requests")
      .insert({
        organization_id: org,
        design_id: design?.id ?? null,
        design_code: design?.code ?? null,
        design_title_ar: design?.titleAr ?? null,
        design_title_en: design?.titleEn ?? null,
        request_key: input.requestKey,
        path: input.path,
        client_name: input.clientName,
        whatsapp_phone: input.whatsappPhone,
        email: input.email,
        project_type: input.projectType,
        land_status: input.landStatus,
        wilayat: input.wilayat,
        land_area_sqm: input.landAreaSqm,
        start_timeline: input.startTimeline,
        idea_text: input.ideaText,
        meeting_mode: input.meetingMode,
        starts_at: slot?.start ?? null,
        ends_at: slot?.end ?? null,
        status: slot ? "confirmed" : "new",
        calendar_status: slot ? "pending" : "not_needed",
        locale: input.locale,
        referrer_host: (() => {
          try {
            return new URL(String(raw.referrer ?? "")).hostname.slice(0, 255) || null
          } catch {
            return null
          }
        })(),
        utm_source: typeof raw.utm_source === "string" ? raw.utm_source.slice(0, 100) || null : null,
        utm_medium: typeof raw.utm_medium === "string" ? raw.utm_medium.slice(0, 100) || null : null,
        utm_campaign: typeof raw.utm_campaign === "string" ? raw.utm_campaign.slice(0, 100) || null : null,
      })
      .select(columns)
      .single()
    if (insertError?.code === "23505") {
      if (insertError.message?.includes("one_per_slot")) return { ok: false, error: "slotTaken" }
      // The same request key won a race: return the saved request.
      const { data: again } = await admin.from("design_meeting_requests").select(columns).eq("organization_id", org).eq("request_key", input.requestKey).maybeSingle()
      if (again) return { ok: true, data: confirmation(again) }
    }
    if (insertError || !inserted) throw insertError ?? new Error("request not saved")

    await attachIdeaFiles(org, inserted.id, input, files)

    let saved: SavedRow = inserted
    if (slot) {
      const update: Record<string, unknown> = {}
      if (!calendar.connected) {
        update.calendar_status = "not_configured"
      } else {
        try {
          const text = summaryText(input, design)
          const event = await calendar.createEvent({
            start: new Date(slot.start),
            end: new Date(slot.end),
            summary: text.summary,
            description: text.description,
            location: input.meetingMode === "office" ? site.site.officeAddressAr ?? site.site.officeAddressEn : null,
            attendeeEmail: input.email,
            withMeet: input.meetingMode === "remote",
            requestId: inserted.id,
          })
          Object.assign(update, { calendar_status: "created", calendar_event_id: event.eventId, meet_link: event.meetLink })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error("design booking: calendar event not created:", message)
          Object.assign(update, { calendar_status: "failed", calendar_error: message.slice(0, 500) })
        }
      }
      const { data: updated, error: updateError } = await admin
        .from("design_meeting_requests")
        .update(update)
        .eq("organization_id", org)
        .eq("id", inserted.id)
        .select(columns)
        .single()
      if (updateError) console.error("design booking: calendar result not saved:", updateError.message)
      else if (updated) saved = updated
    }

    return { ok: true, data: confirmation(saved) }
  } catch (error) {
    console.error("design booking: submit failed:", error instanceof Error ? error.message : error)
    return { ok: false, error: "failed" }
  }
}

type SavedRow = { id: string; meeting_mode: string; starts_at: string | null; meet_link: string | null; calendar_status: string; email: string | null }
