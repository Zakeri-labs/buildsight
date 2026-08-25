import fs from 'fs'

const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Fetch a user from profiles
const { data: profiles, error: profileErr } = await admin.from('profiles').select('id, email, full_name').limit(5)
console.log("Profiles count:", profiles?.length, profileErr)

if (!profiles || !profiles.length) {
  process.exit(1)
}

const testUser = profiles[0]
console.log("Testing with user:", testUser.id, testUser.email)

// Let's test resolveCalendarProjectScope
const [orgMem, projUserMem, viewerMem] = await Promise.all([
  admin.from("organization_memberships").select("organization_id").eq("user_id", testUser.id).eq("status", "active").eq("role", "org_admin"),
  admin.from("project_user_memberships").select("project_id").eq("user_id", testUser.id).eq("status", "active"),
  admin.from("organization_memberships").select("organization_id").eq("user_id", testUser.id).eq("status", "active").eq("role", "viewer"),
])

console.log("Org memberships:", orgMem.data?.length, "Proj memberships:", projUserMem.data?.length)

// Let's test all site_visit_requests queries
const { data: allVisits, error: visitsErr } = await admin.from('site_visit_requests').select('*').limit(5)
console.log("All visits count:", allVisits?.length, visitsErr)
