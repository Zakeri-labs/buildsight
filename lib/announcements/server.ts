import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SystemAnnouncement } from "@/lib/announcements/types"

/**
 * Fetch the active system announcement for display to authenticated users.
 * Returns null if:
 * - Table does not exist or database fails
 * - is_active is false
 * - expires_at is set and in the past
 * - message is empty
 */
export async function getActiveSystemAnnouncement(): Promise<SystemAnnouncement | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("system_announcement")
      .select("*")
      .eq("id", "default")
      .maybeSingle()

    if (error || !data) return null

    const isActive = Boolean(data.is_active)
    const message = (data.message || "").trim()
    if (!isActive || !message) return null

    if (data.expires_at) {
      const expiresTime = new Date(data.expires_at).getTime()
      if (Number.isFinite(expiresTime) && expiresTime <= Date.now()) {
        return null
      }
    }

    return {
      id: data.id,
      message,
      type: (data.type as any) || "maintenance",
      isActive: true,
      expiresAt: data.expires_at || null,
      createdBy: data.created_by || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  } catch {
    return null
  }
}

/**
 * Fetch the system announcement configuration for admin settings.
 */
export async function getSystemAnnouncementConfig(): Promise<SystemAnnouncement | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("system_announcement")
      .select("*")
      .eq("id", "default")
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id,
      message: data.message || "",
      type: (data.type as any) || "maintenance",
      isActive: Boolean(data.is_active),
      expiresAt: data.expires_at || null,
      createdBy: data.created_by || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  } catch {
    return null
  }
}
