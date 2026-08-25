import fs from 'fs'

const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

// Dynamically import @supabase/supabase-js
const { createClient } = await import('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log("Testing site_visit_requests select with CALENDAR_REQUEST_COLUMNS...")
const columns = "id, project_id, requested_by, scheduled_by, client_request_id, status, preferred_date, is_asap, preferred_time, purpose, notes, scheduled_date, scheduled_time, scheduled_notes, report_visit_number, created_at"

const { data, error } = await supabase
  .from('site_visit_requests')
  .select(columns)
  .limit(5)

if (error) {
  console.error("SELECT ERROR:", error)
} else {
  console.log("SUCCESS! Fetched rows count:", data.length)
}
