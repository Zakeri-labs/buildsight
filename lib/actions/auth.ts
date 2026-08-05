"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/redirects"
import { buildAuthCallbackUrl } from "@/lib/auth/site-origin"

export async function getSignUpEmailRedirect(
  nextPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const next = safeNextPath(nextPath, "/onboarding")
  const url = await buildAuthCallbackUrl(next)

  if (!url) {
    console.error(
      "Unable to resolve a trusted public site origin for the Supabase email confirmation callback.",
    )
    return {
      url: null,
      error: "Email confirmation is not configured for this deployment. Please contact an administrator.",
    }
  }

  return { url, error: null }
}

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
