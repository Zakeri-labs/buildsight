"use server"

import { revalidatePath } from "next/cache"
import { AuthzError } from "@/lib/auth/guards"
import { requireOnboarded } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  validateCircleGeometry,
  validatePolygonGeometry,
} from "@/lib/zones/geometry"
import {
  toDomainZone,
  type CreateZoneInput,
  type ProjectZone,
  type ProjectZoneRow,
  type UpdateZoneInput,
  type ZoneActionResult,
} from "@/lib/zones/types"
import type { OrganizationRole } from "@/lib/db/types"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/i

type ZoneAuthContext = {
  userId: string
  organizationId: string
  role: OrganizationRole
}

/**
 * Resolves the authenticated user, trusted organization ID, and organization role.
 * Never trusts a client-supplied organization ID.
 *
 * Rules:
 * - Uses session.supervisingOrg or explicit single active organization membership.
 * - Fails safely if organization context cannot be established confidently.
 * - Explicitly rejects architect_administrator.
 */
async function resolveZoneAuthContext(): Promise<ZoneAuthContext> {
  const session = await requireOnboarded()

  // Prioritize supervising organization; fallback to primary membership if unambiguous
  const org =
    session.supervisingOrg ??
    (session.memberships.length === 1 ? session.memberships[0].organization : null)

  if (!org?.id || !UUID_PATTERN.test(org.id)) {
    throw new AuthzError("Active organization could not be established.")
  }

  const membership = session.memberships.find((m) => m.organization?.id === org.id)
  if (!membership) {
    throw new AuthzError("You are not an active member of this organization.")
  }

  // Architect Administrator role is strictly restricted to Design Gallery
  if (membership.role === "architect_administrator") {
    throw new AuthzError("Architect administrators do not have access to project zones.")
  }

  return {
    userId: session.userId,
    organizationId: org.id,
    role: membership.role,
  }
}

/**
 * Confirms that the caller is an organization admin or organization manager.
 * Throws AuthzError if unauthorized.
 */
function assertZoneMutationRole(role: OrganizationRole): void {
  if (role !== "org_admin" && role !== "org_manager") {
    throw new AuthzError("Only organization admins and managers can create, edit, or delete zones.")
  }
}

function actionError(error: unknown, fallback: string): ZoneActionResult<never> {
  const message =
    error instanceof AuthzError
      ? error.message
      : error instanceof Error
        ? error.message
        : fallback
  return { ok: false, error: message }
}

/**
 * Retrieves all geographic zones belonging to the user's active organization.
 * Accessible to org_admin, org_manager, org_member, and viewer.
 */
export async function getOrganizationZonesAction(): Promise<ZoneActionResult<ProjectZone[]>> {
  try {
    const context = await resolveZoneAuthContext()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("project_zones")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })

    if (error) {
      if (error.code === "42P01") {
        // Table not yet migrated
        return { ok: true, data: [] }
      }
      throw error
    }

    const zones = (data ?? []).map((row: ProjectZoneRow) => toDomainZone(row))
    return { ok: true, data: zones }
  } catch (error) {
    return actionError(error, "Failed to retrieve organization zones.")
  }
}

/**
 * Creates a new geographic zone (Circle or Polygon).
 * Restricted to org_admin and org_manager.
 */
export async function createProjectZoneAction(
  input: CreateZoneInput,
): Promise<ZoneActionResult<ProjectZone>> {
  try {
    const context = await resolveZoneAuthContext()
    assertZoneMutationRole(context.role)

    // 1. Validate Name
    const name = input?.name?.trim() ?? ""
    if (name.length < 2) {
      return { ok: false, error: "Zone name must be at least 2 characters long." }
    }
    if (name.length > 100) {
      return { ok: false, error: "Zone name cannot exceed 100 characters." }
    }

    // 2. Validate Color
    const color = input?.color?.trim().toLowerCase() ?? ""
    if (!COLOR_HEX_PATTERN.test(color)) {
      return { ok: false, error: "Zone color must be a valid 6-character hex code (e.g. #3b82f6)." }
    }

    // 3. Validate Zone Type & Geometry
    if (input.type !== "circle" && input.type !== "polygon") {
      return { ok: false, error: "Zone type must be either 'circle' or 'polygon'." }
    }

    let circleCenterLat: number | null = null
    let circleCenterLng: number | null = null
    let circleRadiusMeters: number | null = null
    let polygonCoordinates: [number, number][] | null = null

    if (input.type === "circle") {
      const circleGeo = input.geometry
      const validation = validateCircleGeometry(circleGeo.center, circleGeo.radiusMeters)
      if (!validation.valid) {
        return { ok: false, error: validation.error ?? "Invalid circle geometry." }
      }
      circleCenterLat = circleGeo.center.lat
      circleCenterLng = circleGeo.center.lng
      circleRadiusMeters = circleGeo.radiusMeters
    } else {
      const polygonGeo = input.geometry
      const validation = validatePolygonGeometry(polygonGeo.coordinates)
      if (!validation.valid || !validation.normalized) {
        return { ok: false, error: validation.error ?? "Invalid polygon geometry." }
      }
      // Store in canonical [latitude, longitude] array format
      polygonCoordinates = validation.normalized.map((point) => [point.lat, point.lng])
    }

    // 4. Insert into database
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("project_zones")
      .insert({
        organization_id: context.organizationId,
        name,
        zone_type: input.type,
        color,
        circle_center_lat: circleCenterLat,
        circle_center_lng: circleCenterLng,
        circle_radius_meters: circleRadiusMeters,
        polygon_coordinates: polygonCoordinates,
        created_by: context.userId,
      })
      .select("*")
      .single()

    if (error) throw error

    revalidatePath("/projects")
    return { ok: true, data: toDomainZone(data as ProjectZoneRow) }
  } catch (error) {
    return actionError(error, "Failed to create project zone.")
  }
}

/**
 * Updates an existing geographic zone.
 * Restricted to org_admin and org_manager.
 * Cannot alter organization_id or created_by.
 */
export async function updateProjectZoneAction(
  input: UpdateZoneInput,
): Promise<ZoneActionResult<ProjectZone>> {
  try {
    const context = await resolveZoneAuthContext()
    assertZoneMutationRole(context.role)

    const zoneId = input?.id?.trim() ?? ""
    if (!UUID_PATTERN.test(zoneId)) {
      return { ok: false, error: "Invalid zone ID." }
    }

    const admin = createAdminClient()

    // 1. Verify zone exists and belongs to the caller's organization
    const { data: existing, error: fetchError } = await admin
      .from("project_zones")
      .select("*")
      .eq("id", zoneId)
      .eq("organization_id", context.organizationId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) {
      return { ok: false, error: "Zone not found or access denied." }
    }

    // 2. Validate updates
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (name.length < 2) {
        return { ok: false, error: "Zone name must be at least 2 characters long." }
      }
      if (name.length > 100) {
        return { ok: false, error: "Zone name cannot exceed 100 characters." }
      }
      updates.name = name
    }

    if (input.color !== undefined) {
      const color = input.color.trim().toLowerCase()
      if (!COLOR_HEX_PATTERN.test(color)) {
        return { ok: false, error: "Zone color must be a valid 6-character hex code (e.g. #3b82f6)." }
      }
      updates.color = color
    }

    if (input.geometry !== undefined) {
      if (input.type === "circle") {
        const circleGeo = input.geometry
        const validation = validateCircleGeometry(circleGeo.center, circleGeo.radiusMeters)
        if (!validation.valid) {
          return { ok: false, error: validation.error ?? "Invalid circle geometry." }
        }
        updates.zone_type = "circle"
        updates.circle_center_lat = circleGeo.center.lat
        updates.circle_center_lng = circleGeo.center.lng
        updates.circle_radius_meters = circleGeo.radiusMeters
        updates.polygon_coordinates = null
      } else if (input.type === "polygon") {
        const polygonGeo = input.geometry
        const validation = validatePolygonGeometry(polygonGeo.coordinates)
        if (!validation.valid || !validation.normalized) {
          return { ok: false, error: validation.error ?? "Invalid polygon geometry." }
        }
        updates.zone_type = "polygon"
        updates.circle_center_lat = null
        updates.circle_center_lng = null
        updates.circle_radius_meters = null
        updates.polygon_coordinates = validation.normalized.map((p) => [p.lat, p.lng])
      }
    }

    // 3. Update record
    const { data: updated, error: updateError } = await admin
      .from("project_zones")
      .update(updates)
      .eq("id", zoneId)
      .eq("organization_id", context.organizationId)
      .select("*")
      .single()

    if (updateError) throw updateError

    revalidatePath("/projects")
    return { ok: true, data: toDomainZone(updated as ProjectZoneRow) }
  } catch (error) {
    return actionError(error, "Failed to update project zone.")
  }
}

/**
 * Deletes a geographic zone.
 * Restricted to org_admin and org_manager.
 * NEVER deletes or modifies any project records, coordinates, or stage reports.
 */
export async function deleteProjectZoneAction(
  zoneId: string,
): Promise<ZoneActionResult<undefined>> {
  try {
    const context = await resolveZoneAuthContext()
    assertZoneMutationRole(context.role)

    const cleanId = zoneId?.trim() ?? ""
    if (!UUID_PATTERN.test(cleanId)) {
      return { ok: false, error: "Invalid zone ID." }
    }

    const admin = createAdminClient()

    // Ensure the zone exists in caller's organization before deleting
    const { error } = await admin
      .from("project_zones")
      .delete()
      .eq("id", cleanId)
      .eq("organization_id", context.organizationId)

    if (error) throw error

    revalidatePath("/projects")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Failed to delete project zone.")
  }
}
