"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    return { error: error?.message ?? null }
  } catch (error) {
    console.error("Supabase sign-in failed:", error)
    return {
      error: error instanceof Error ? error.message : "Unable to sign in. Please try again.",
    }
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/auth/login")
}
