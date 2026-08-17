import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export type DefaultLandingResolution = {
  destination: "/" | "/memberhomepage"
  mode: "admin" | "member" | "fallback"
}

type SupabaseErrorFields = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function errorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") return {}
  const value = error as Record<string, unknown>
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
  }
}

function logLandingLookupError(operation: string, error: unknown) {
  const fields = errorFields(error)
  console.error("[auth] default landing lookup failed", {
    operation,
    code: fields.code ?? null,
    message: fields.message ?? "Unknown Supabase error",
    details: fields.details ?? null,
    hint: fields.hint ?? null,
  })
}

function createLandingLookupClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    logLandingLookupError("create default landing lookup client", {
      message: "Required server-side Supabase configuration is unavailable.",
    })
    return null
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Resolve only the application's default authenticated landing destination.
 * Explicit safe `next` destinations bypass this resolver entirely.
 */
export async function resolveDefaultLandingDestination(userId: string): Promise<DefaultLandingResolution> {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : ""
  if (!UUID_PATTERN.test(normalizedUserId)) return { destination: "/", mode: "fallback" }

  const effective = await resolveUserEffectiveRole(normalizedUserId)
  if (effective.role === "admin") return { destination: "/", mode: "admin" }
  if (effective.role === "member") return { destination: "/memberhomepage", mode: "member" }
  return { destination: "/", mode: "fallback" }
}
