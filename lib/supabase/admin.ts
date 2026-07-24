import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Service-role client. Bypasses RLS — use ONLY inside trusted server actions /
 * route handlers AFTER verifying the caller's identity and authorization.
 * Never import this into client components.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set")
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
