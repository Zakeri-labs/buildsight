"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserIdOrThrow } from "@/lib/auth/guards"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import type { AnnouncementType, SystemAnnouncement } from "@/lib/announcements/types"
import { getSystemAnnouncementConfig } from "@/lib/announcements/server"

export type SaveAnnouncementInput = {
  message: string
  type: AnnouncementType
  isActive: boolean
  expiresAt: string | null
}

export type AnnouncementActionResult<T = void> = {
  ok: boolean
  error?: string
  data?: T
}

/**
 * Fetch announcement configuration for the settings page.
 */
export async function getSystemAnnouncementAction(): Promise<
  AnnouncementActionResult<SystemAnnouncement | null>
> {
  try {
    const userId = await getUserIdOrThrow()
    const roleRes = await resolveUserEffectiveRole(userId)
    if (roleRes.role !== "admin") {
      return { ok: false, error: "Only administrators can view or manage announcement settings." }
    }

    const config = await getSystemAnnouncementConfig()
    return { ok: true, data: config }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load announcement settings." }
  }
}

/**
 * Save announcement settings. Admin only.
 */
export async function saveSystemAnnouncementAction(
  input: SaveAnnouncementInput,
): Promise<AnnouncementActionResult<SystemAnnouncement>> {
  try {
    const userId = await getUserIdOrThrow()
    const roleRes = await resolveUserEffectiveRole(userId)
    if (roleRes.role !== "admin") {
      return { ok: false, error: "Only administrators can update system announcements." }
    }

    const validTypes: AnnouncementType[] = ["maintenance", "update", "general"]
    const announcementType: AnnouncementType = validTypes.includes(input.type) ? input.type : "general"
    const message = input.message.trim()

    let expiresAtIso: string | null = null
    if (input.expiresAt) {
      const parsed = new Date(input.expiresAt)
      if (!isNaN(parsed.getTime())) {
        expiresAtIso = parsed.toISOString()
      }
    }

    const admin = createAdminClient()
    const payload = {
      id: "default",
      message,
      type: announcementType,
      is_active: Boolean(input.isActive),
      expires_at: expiresAtIso,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await admin
      .from("system_announcement")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single()

    if (error) {
      console.error("saveSystemAnnouncementAction failed:", error)
      return { ok: false, error: error.message || "Failed to save announcement." }
    }

    revalidatePath("/", "layout")

    return {
      ok: true,
      data: {
        id: data.id,
        message: data.message,
        type: data.type as AnnouncementType,
        isActive: Boolean(data.is_active),
        expiresAt: data.expires_at,
        createdBy: data.created_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }
  } catch (err) {
    console.error("saveSystemAnnouncementAction error:", err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save announcement." }
  }
}
