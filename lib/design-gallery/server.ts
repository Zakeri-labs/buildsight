import "server-only"

import { assertOrgAdmin, AuthzError } from "@/lib/auth/guards"
import { requireOnboarded } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { pickDesignGalleryAdminOrg, type DesignGalleryAdminOrg } from "./access"
import { DEFAULT_BOOKING_SETTINGS } from "./booking/slots"
import { designImagePublicUrl } from "./images"
import type { Design, DesignCategory, DesignGallerySite, DesignImage, DesignStatus } from "./types"

type AdminClient = ReturnType<typeof createAdminClient>

export type DesignGalleryAdminContext = {
  userId: string
  org: DesignGalleryAdminOrg
  admin: AdminClient
}

/**
 * Resolves the organization the caller administers and re-checks org_admin
 * against the database. Throws AuthzError when the caller is not an admin.
 */
export async function requireDesignGalleryAdmin(): Promise<DesignGalleryAdminContext> {
  const session = await requireOnboarded()
  const org = pickDesignGalleryAdminOrg(session.memberships)
  if (!org) throw new AuthzError("Only organization admins can manage the design gallery.")
  const userId = await assertOrgAdmin(org.id)
  return { userId, org, admin: createAdminClient() }
}

/** Same as requireDesignGalleryAdmin, but returns null instead of throwing (for pages). */
export async function getDesignGalleryAdmin(): Promise<DesignGalleryAdminContext | null> {
  try {
    return await requireDesignGalleryAdmin()
  } catch (error) {
    if (error instanceof AuthzError) return null
    throw error
  }
}

export const DESIGN_COLUMNS =
  "id, organization_id, category_id, slug, code, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, floors_ar, floors_en, built_area_sqm, bedrooms, service_ar, service_en, is_bookable, status, sort_order, published_at, updated_at, design_images(id, storage_path, alt_ar, alt_en, order_index, created_at)"

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapSite(row: any): DesignGallerySite {
  return {
    organizationId: row.organization_id,
    slug: row.slug,
    customHost: row.custom_host ?? null,
    isEnabled: Boolean(row.is_enabled),
    displayNameAr: row.display_name_ar ?? null,
    displayNameEn: row.display_name_en ?? null,
    whatsappPhone: row.whatsapp_phone ?? null,
    logoUrl: row.logo_url ?? null,
    websiteUrl: row.website_url ?? null,
    isDefault: Boolean(row.is_default),
    booking: {
      timeZone: row.booking_timezone ?? DEFAULT_BOOKING_SETTINGS.timeZone,
      workDays: Array.isArray(row.booking_work_days) ? row.booking_work_days.map(Number) : DEFAULT_BOOKING_SETTINGS.workDays,
      dayStart: typeof row.booking_day_start === "string" ? row.booking_day_start.slice(0, 5) : DEFAULT_BOOKING_SETTINGS.dayStart,
      dayEnd: typeof row.booking_day_end === "string" ? row.booking_day_end.slice(0, 5) : DEFAULT_BOOKING_SETTINGS.dayEnd,
      slotMinutes: Number(row.booking_slot_minutes ?? DEFAULT_BOOKING_SETTINGS.slotMinutes),
      minNoticeHours: Number(row.booking_min_notice_hours ?? DEFAULT_BOOKING_SETTINGS.minNoticeHours),
      daysAhead: Number(row.booking_days_ahead ?? DEFAULT_BOOKING_SETTINGS.daysAhead),
    },
    officeAddressAr: row.office_address_ar ?? null,
    officeAddressEn: row.office_address_en ?? null,
  }
}

export function mapCategory(row: any): DesignCategory {
  return {
    id: row.id,
    key: row.key,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    sortOrder: row.sort_order ?? 0,
    bookableByDefault: Boolean(row.bookable_by_default),
  }
}

export function mapDesign(row: any): Design {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const images: DesignImage[] = ((row.design_images ?? []) as any[])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id)))
    .flatMap((image) => {
      const url = designImagePublicUrl(image.storage_path, supabaseUrl)
      return url
        ? [{
            id: image.id,
            storagePath: image.storage_path,
            url,
            altAr: image.alt_ar ?? null,
            altEn: image.alt_en ?? null,
            orderIndex: image.order_index ?? 0,
          }]
        : []
    })

  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    slug: row.slug,
    code: row.code,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    summaryAr: row.summary_ar ?? null,
    summaryEn: row.summary_en ?? null,
    descriptionAr: row.description_ar ?? null,
    descriptionEn: row.description_en ?? null,
    floorsAr: row.floors_ar ?? null,
    floorsEn: row.floors_en ?? null,
    builtAreaSqm: toNumber(row.built_area_sqm),
    bedrooms: toNumber(row.bedrooms),
    serviceAr: row.service_ar ?? null,
    serviceEn: row.service_en ?? null,
    isBookable: Boolean(row.is_bookable),
    status: row.status as DesignStatus,
    sortOrder: row.sort_order ?? 0,
    publishedAt: row.published_at ?? null,
    updatedAt: row.updated_at,
    images,
  }
}

export async function loadSite(admin: AdminClient, organizationId: string): Promise<DesignGallerySite | null> {
  const { data, error } = await admin
    .from("design_gallery_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  return data ? mapSite(data) : null
}

export async function loadCategories(admin: AdminClient, organizationId: string): Promise<DesignCategory[]> {
  const { data, error } = await admin
    .from("design_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapCategory)
}

export async function loadDesigns(admin: AdminClient, organizationId: string): Promise<Design[]> {
  const { data, error } = await admin
    .from("designs")
    .select(DESIGN_COLUMNS)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapDesign)
}

export async function loadDesign(
  admin: AdminClient,
  organizationId: string,
  designId: string,
): Promise<Design | null> {
  const { data, error } = await admin
    .from("designs")
    .select(DESIGN_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", designId)
    .maybeSingle()
  if (error) throw error
  return data ? mapDesign(data) : null
}
