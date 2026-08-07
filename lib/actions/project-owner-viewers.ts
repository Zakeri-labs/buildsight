"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, AuthzError } from "@/lib/auth/guards"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ProjectOwnerViewerOption = {
  id: string
  source: "registered" | "pending"
  name: string
  ownerName: string
  contactName: string
  email: string
  phone: string
}

type ProjectOwnerViewerResult =
  | { ok: true; data: ProjectOwnerViewerOption[] }
  | { ok: false; error: string }

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

/**
 * Loads the fresh Owner-source list for Step 2 of Add Project.
 *
 * The canonical application role is organization role `viewer`. The list is a
 * read-only combination of active Viewer memberships and still-valid pending
 * Viewer invitations in the same supervising organization. Selecting an entry
 * never mutates membership or invitation state; it only provides data used to
 * prefill the existing project-owner snapshot fields.
 */
export async function loadProjectOwnerViewers(input: {
  supervisingOrgId: string
}): Promise<ProjectOwnerViewerResult> {
  try {
    const supervisingOrgId = input.supervisingOrgId.trim()
    if (!UUID_PATTERN.test(supervisingOrgId)) {
      return { ok: false, error: "Unable to load viewers." }
    }

    await assertOrgAdmin(supervisingOrgId)
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const [{ data: memberships, error: membershipError }, { data: invitations, error: invitationError }] = await Promise.all([
      admin
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", supervisingOrgId)
        .eq("role", "viewer")
        .eq("status", "active"),
      admin
        .from("invitations")
        .select("id, email, created_at")
        .eq("organization_id", supervisingOrgId)
        .eq("organization_role", "viewer")
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false }),
    ])

    if (membershipError) throw membershipError
    if (invitationError) throw invitationError

    const viewerUserIds = Array.from(
      new Set(
        (memberships ?? [])
          .map((membership) => membership.user_id)
          .filter((id): id is string => UUID_PATTERN.test(id ?? "")),
      ),
    )

    const profileResult = viewerUserIds.length > 0
      ? await admin.from("profiles").select("id, full_name, email").in("id", viewerUserIds)
      : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }>, error: null }

    if (profileResult.error) throw profileResult.error

    const registeredViewers = (profileResult.data ?? [])
      .filter((profile) => UUID_PATTERN.test(profile.id ?? ""))
      .map((profile) => {
        const email = profile.email?.trim() || ""
        const realName = profile.full_name?.trim() || ""
        const displayName = realName || email
        if (!displayName) return null

        return {
          id: profile.id,
          source: "registered" as const,
          name: displayName,
          ownerName: realName,
          contactName: realName,
          email,
          phone: "",
        } satisfies ProjectOwnerViewerOption
      })
      .filter((viewer): viewer is ProjectOwnerViewerOption => Boolean(viewer))

    // Registered Viewer membership is authoritative when the same email also
    // has invitation history. This prevents an accepted Viewer from appearing
    // a second time as a stale/redundant pending entry.
    const registeredEmails = new Set(
      registeredViewers
        .map((viewer) => normalizedEmail(viewer.email))
        .filter(Boolean),
    )

    const pendingByEmail = new Map<string, ProjectOwnerViewerOption>()
    for (const invitation of invitations ?? []) {
      if (!UUID_PATTERN.test(invitation.id ?? "")) continue
      const email = invitation.email?.trim() || ""
      const emailKey = normalizedEmail(email)
      if (!emailKey || registeredEmails.has(emailKey) || pendingByEmail.has(emailKey)) continue

      // The current invitations schema stores email but no invited name/phone,
      // so those Owner fields intentionally remain blank until edited manually.
      pendingByEmail.set(emailKey, {
        id: invitation.id,
        source: "pending",
        name: email,
        ownerName: "",
        contactName: "",
        email,
        phone: "",
      })
    }

    const combined = [...registeredViewers, ...pendingByEmail.values()].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      if (byName !== 0) return byName
      if (a.source !== b.source) return a.source === "registered" ? -1 : 1
      return a.email.localeCompare(b.email, undefined, { sensitivity: "base" })
    })

    return { ok: true, data: combined }
  } catch (error) {
    console.error("loadProjectOwnerViewers failed", {
      operation: "project_owner_viewer_list",
      code: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "",
      message: error instanceof Error ? error.message : "Unknown error",
      details: typeof error === "object" && error && "details" in error ? String((error as { details?: unknown }).details ?? "") : "",
      hint: typeof error === "object" && error && "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "",
    })
    return {
      ok: false,
      error: error instanceof AuthzError ? "You do not have permission to load viewers." : "Unable to refresh viewers.",
    }
  }
}
