import "server-only"

import type { AppNotificationItem } from "@/lib/notifications/types"
import { createAdminClient } from "@/lib/supabase/admin"
import type { DesignGalleryAdminContext } from "../server"
import { pickDesignGalleryAdminOrg } from "../access"
import { DEFAULT_BOOKING_SETTINGS } from "./slots"
import { MEETING_FILES_BUCKET } from "./server"
import {
  designMeetingNotification,
  NOTIFY_STATUSES,
  NOTIFY_WINDOW_DAYS,
  type MeetingNotificationRow,
} from "./notifications"

/**
 * Bell notifications for new meeting requests: only for an org_admin (checked
 * against the database here, not taken from the caller), and only for the
 * organization whose gallery they manage, so the item opens a request they
 * can see in /design-gallery/requests.
 */
export async function getDesignMeetingNotificationFeed({
  userId,
  now = new Date(),
}: {
  userId: string
  now?: Date
}): Promise<{ canNotify: boolean; items: AppNotificationItem[] }> {
  const admin = createAdminClient()
  const { data: memberships, error } = await admin
    .from("organization_memberships")
    .select("role, organizations(id, name, type)")
    .eq("user_id", userId)
    .eq("role", "org_admin")
    .eq("status", "active")
  if (error) throw error
  // The same organization the admin page and the request list show.
  const org = pickDesignGalleryAdminOrg(
    (memberships ?? []).map((m: any) => ({ role: m.role, organization: Array.isArray(m.organizations) ? m.organizations[0] : m.organizations })),
  )
  if (!org) return { canNotify: false, items: [] }
  const orgIds = [org.id]

  const since = new Date(now.getTime() - NOTIFY_WINDOW_DAYS * 86_400_000).toISOString()
  const [requests, sites] = await Promise.all([
    admin
      .from("design_meeting_requests")
      .select("id, organization_id, client_name, path, meeting_mode, starts_at, status, created_at, design_code")
      .in("organization_id", orgIds)
      .in("status", [...NOTIFY_STATUSES])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("design_gallery_sites").select("organization_id, booking_timezone").in("organization_id", orgIds),
  ])
  // Before migration 084 the table does not exist: no gallery notifications, nothing else breaks.
  if (requests.error) {
    if (requests.error.code === "42P01") return { canNotify: false, items: [] }
    throw requests.error
  }
  const zones = new Map<string, string>(
    (sites.data ?? []).map((s: { organization_id: string; booking_timezone?: string }) => [
      s.organization_id,
      s.booking_timezone ?? DEFAULT_BOOKING_SETTINGS.timeZone,
    ]),
  )
  const items = ((requests.data ?? []) as unknown as MeetingNotificationRow[]).map((row) =>
    designMeetingNotification(row, zones.get(row.organization_id) ?? DEFAULT_BOOKING_SETTINGS.timeZone),
  )
  return { canNotify: (sites.data ?? []).length > 0, items }
}

export type MeetingRequestRow = {
  id: string
  path: "same" | "modified" | "idea"
  clientName: string
  whatsappPhone: string
  email: string | null
  projectType: string
  landStatus: string
  wilayat: string | null
  landAreaSqm: number | null
  startTimeline: string
  ideaText: string | null
  meetingMode: "remote" | "office" | "call_me"
  startsAt: string | null
  status: string
  calendarStatus: string
  calendarError: string | null
  meetLink: string | null
  locale: string | null
  source: string | null
  createdAt: string
  design: { slug: string | null; code: string | null; titleAr: string; titleEn: string } | null
  attachments: { id: string; name: string; contentType: string; url: string | null }[]
}

const SIGNED_URL_SECONDS = 60 * 60

/** Requests of the admin's organization, newest first, with short-lived links to their files. */
export async function loadMeetingRequests(ctx: DesignGalleryAdminContext, limit = 200): Promise<MeetingRequestRow[]> {
  const { data, error } = await ctx.admin
    .from("design_meeting_requests")
    .select(
      "id, path, client_name, whatsapp_phone, email, project_type, land_status, wilayat, land_area_sqm, start_timeline, idea_text, meeting_mode, starts_at, status, calendar_status, calendar_error, meet_link, locale, referrer_host, utm_source, created_at, design_code, design_title_ar, design_title_en, designs(slug, code, title_ar, title_en), design_meeting_attachments(id, storage_path, content_type, file_name)",
    )
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    if (error.code === "42P01") return []
    throw error
  }
  const rows = (data ?? []) as any[]
  const paths = rows.flatMap((r) => (r.design_meeting_attachments ?? []).map((a: any) => a.storage_path as string))
  const signed = new Map<string, string>()
  if (paths.length > 0) {
    const { data: urls } = await ctx.admin.storage.from(MEETING_FILES_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    clientName: r.client_name,
    whatsappPhone: r.whatsapp_phone,
    email: r.email ?? null,
    projectType: r.project_type,
    landStatus: r.land_status,
    wilayat: r.wilayat ?? null,
    landAreaSqm: r.land_area_sqm == null ? null : Number(r.land_area_sqm),
    startTimeline: r.start_timeline,
    ideaText: r.idea_text ?? null,
    meetingMode: r.meeting_mode,
    startsAt: r.starts_at ?? null,
    status: r.status,
    calendarStatus: r.calendar_status,
    calendarError: r.calendar_error ?? null,
    meetLink: r.meet_link ?? null,
    locale: r.locale ?? null,
    source: r.utm_source ?? r.referrer_host ?? null,
    createdAt: r.created_at,
    // The design as it is now, or as it was when booked if it has been deleted since.
    design: r.designs
      ? { slug: r.designs.slug, code: r.designs.code ?? null, titleAr: r.designs.title_ar, titleEn: r.designs.title_en }
      : r.design_code
        ? { slug: null, code: r.design_code, titleAr: r.design_title_ar ?? r.design_code, titleEn: r.design_title_en ?? r.design_code }
        : null,
    attachments: (r.design_meeting_attachments ?? []).map((a: any) => ({
      id: a.id,
      name: a.file_name || a.storage_path.split("/").pop(),
      contentType: a.content_type,
      url: signed.get(a.storage_path) ?? null,
    })),
  }))
}

/** Requests waiting for the team, for the badge on the admin page. */
export async function countOpenRequests(ctx: DesignGalleryAdminContext): Promise<number> {
  const { count, error } = await ctx.admin
    .from("design_meeting_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.org.id)
    .in("status", [...NOTIFY_STATUSES])
  if (error) return 0
  return count ?? 0
}
