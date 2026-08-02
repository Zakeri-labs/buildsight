"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { assertOrgAdmin, getUserIdOrThrow, audit, AuthzError } from "@/lib/auth/guards"
import type { OrganizationCategory, OrganizationRole } from "@/lib/db/types"
import { ORGANIZATION_CATEGORIES, ORGANIZATION_ROLES } from "@/lib/db/types"
import type { ActionResult } from "@/lib/actions/invitations"

/** Search organizations by name (RLS-scoped to the caller's visibility). */
export async function searchOrganizations(query: string): Promise<
  ActionResult<{ id: string; name: string; type: string; status: string }[]>
> {
  try {
    await getUserIdOrThrow()
    const supabase = await createClient()
    let q = supabase.from("organizations").select("id, name, type, status").order("name").limit(20)
    if (query.trim()) q = q.ilike("name", `%${query.trim()}%`)
    const { data, error } = await q
    if (error) throw error
    return { ok: true, data: data ?? [] }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Search failed." }
  }
}

/**
 * Create a standalone external organization. Only a supervising org admin may
 * create organizations. The supervising org id is validated server-side.
 */
export async function createOrganization(input: {
  supervisingOrgId: string
  name: string
  organizationCategory?: OrganizationCategory
  contactPerson?: string
  email?: string
  phone?: string
  registrationNumber?: string
  address?: string
  postalCode?: string
  website?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const name = input.name.trim()
    const organizationCategory = input.organizationCategory ?? "other"
    const contactPerson = input.contactPerson?.trim() || null
    const email = input.email?.trim().toLowerCase() || null
    const phone = input.phone?.trim() || null
    const registrationNumber = input.registrationNumber?.trim() || null
    const address = input.address?.trim() || null
    const postalCode = input.postalCode?.trim() || null
    const website = input.website?.trim() || null

    if (name.length < 2) return { ok: false, error: "Organization name is too short." }
    if (!ORGANIZATION_CATEGORIES.includes(organizationCategory)) {
      return { ok: false, error: "Select a valid organization type." }
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." }
    }

    // Use the authenticated session for the call. The SECURITY DEFINER RPC
    // performs the authoritative org-admin check in the database and writes
    // all profile fields atomically without depending on a service-role insert.
    const actorId = await getUserIdOrThrow()
    const supabase = await createClient()
    const { data: createdId, error } = await supabase.rpc("create_external_organization", {
      p_supervising_organization_id: input.supervisingOrgId,
      p_name: name,
      p_organization_category: organizationCategory,
      p_contact_person: contactPerson,
      p_email: email,
      p_phone: phone,
      p_registration_number: registrationNumber,
      p_address: address,
      p_postal_code: postalCode,
      p_website: website,
    })

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "An organization with this name already exists." }
      }
      if (error.code === "42501") {
        return { ok: false, error: error.message || "You do not have permission to create organizations." }
      }
      if (error.code === "PGRST202" || error.message.toLowerCase().includes("create_external_organization")) {
        return { ok: false, error: "Organization creation is not configured. Run the latest Supabase migration." }
      }
      console.error("createOrganization RPC failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      return { ok: false, error: error.message || "Could not create organization." }
    }

    if (typeof createdId !== "string" || !createdId) {
      return { ok: false, error: "Could not create organization." }
    }

    await audit({
      actorId,
      action: "organization.created",
      entityType: "organization",
      entityId: createdId,
      organizationId: createdId,
      metadata: { name, organizationCategory, status: "pending" },
    })
    revalidatePath("/users")
    return { ok: true, data: { id: createdId } }
  } catch (err) {
    console.error("createOrganization failed", err)
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create organization." }
  }
}

/** Update an org member's role. Caller must be admin of that org. */
export async function updateOrgMemberRole(input: {
  organizationId: string
  membershipId: string
  role: OrganizationRole
}): Promise<ActionResult> {
  try {
    if (!ORGANIZATION_ROLES.includes(input.role)) return { ok: false, error: "Invalid role." }
    const actorId = await assertOrgAdmin(input.organizationId)
    const admin = createAdminClient()

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("id, user_id, role")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()
    if (!membership) return { ok: false, error: "Member not found." }

    // Guard: do not allow removing the last admin.
    if (membership.role === "org_admin" && input.role !== "org_admin") {
      const { count } = await admin
        .from("organization_memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .eq("role", "org_admin")
        .eq("status", "active")
      if ((count ?? 0) <= 1) return { ok: false, error: "An organization needs at least one admin." }
    }

    const { error } = await admin
      .from("organization_memberships")
      .update({ role: input.role })
      .eq("id", input.membershipId)
    if (error) throw error

    await audit({
      actorId,
      action: "membership.role_updated",
      entityType: "organization_membership",
      entityId: input.membershipId,
      organizationId: input.organizationId,
      metadata: { role: input.role },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not update role." }
  }
}

/** Deactivate an org member. Caller must be admin of that org. */
export async function removeOrgMember(input: {
  organizationId: string
  membershipId: string
}): Promise<ActionResult> {
  try {
    const actorId = await assertOrgAdmin(input.organizationId)
    const admin = createAdminClient()

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("id, role")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()
    if (!membership) return { ok: false, error: "Member not found." }

    if (membership.role === "org_admin") {
      const { count } = await admin
        .from("organization_memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .eq("role", "org_admin")
        .eq("status", "active")
      if ((count ?? 0) <= 1) return { ok: false, error: "An organization needs at least one admin." }
    }

    const { error } = await admin
      .from("organization_memberships")
      .update({ status: "inactive" })
      .eq("id", input.membershipId)
    if (error) throw error

    await audit({
      actorId,
      action: "membership.removed",
      entityType: "organization_membership",
      entityId: input.membershipId,
      organizationId: input.organizationId,
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not remove member." }
  }
}
