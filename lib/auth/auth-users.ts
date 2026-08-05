import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

/** Find an existing Supabase Auth user without creating or signing in a user. */
export async function authUserExistsByEmail(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const target = email.trim().toLowerCase()

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    if (data.users.some((user) => (user.email ?? "").toLowerCase() === target)) return true
    if (data.users.length < 200) break
  }

  return false
}
