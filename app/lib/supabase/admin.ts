import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Service-role client. Bypasses RLS — use ONLY inside trusted server actions /
 * route handlers AFTER verifying the caller's identity and authorization.
 * Never import this into client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co"
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-service-role-key-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
