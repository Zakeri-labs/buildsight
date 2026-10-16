import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { INTERNAL_AUTH_HEADERS, verifyAuthPayload } from "@/lib/auth/internal-tokens"

export type VerifiedAuthUser = {
  id: string
  email: string
}

async function getForwardedAuthUser(): Promise<VerifiedAuthUser | null> {
  try {
    const headerStore = await headers()
    const userId = headerStore.get(INTERNAL_AUTH_HEADERS.USER_ID)
    const email = headerStore.get(INTERNAL_AUTH_HEADERS.USER_EMAIL) ?? ""
    const ts = headerStore.get(INTERNAL_AUTH_HEADERS.TS)
    const sig = headerStore.get(INTERNAL_AUTH_HEADERS.SIG)

    if (!userId || !ts || !sig) {
      return null
    }

    const isValid = await verifyAuthPayload(userId, email, ts, sig)
    if (!isValid) {
      return null
    }

    return { id: userId, email }
  } catch {
    return null
  }
}

/**
 * Resolves the authenticated user for the current request.
 *
 * 1. Checks for a cryptographically verified user identity forwarded by Next.js Middleware.
 *    If present and valid (HMAC signed with server secret, <60s old), returns { id, email }
 *    with ZERO network round-trips to Supabase Auth.
 * 2. If headers are absent or invalid (e.g. direct invocation, internal test, or unhandled path),
 *    safely falls back to `supabase.auth.getUser()`.
 * 3. Wrapped with React `cache()` so repeated calls within the same Server Component /
 *    Server Action / Route Handler request lifecycle execute at most ONCE.
 */
export const getVerifiedAuthUser = cache(async (): Promise<VerifiedAuthUser | null> => {
  const forwarded = await getForwardedAuthUser()
  if (forwarded) {
    return forwarded
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null
    return { id: user.id, email: user.email ?? "" }
  } catch {
    return null
  }
})
