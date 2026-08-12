"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function updateProfile(
  fullName: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Not authenticated." }
    }

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      return { success: false, error: "Name cannot be empty." }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmedName, updated_at: new Date().toISOString() })
      .eq("id", user.id)

    if (error) {
      console.error("Profile update error:", error)
      return { success: false, error: error.message }
    }

    revalidatePath("/", "layout")
    return { success: true, error: null }
  } catch (err) {
    console.error("updateProfile unexpected error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unable to update profile.",
    }
  }
}
