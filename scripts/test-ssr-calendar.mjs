import fs from 'fs'

const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

// Import server loader
const { getCalendarData } = await import('./lib/calendar/server.js')
const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: profiles } = await admin.from('profiles').select('id, email').limit(10)

for (const p of profiles || []) {
  try {
    console.log("Testing user:", p.id, p.email)
    const data = await getCalendarData({ userId: p.id, monthKey: "2026-08" })
    console.log("SUCCESS for user", p.email, "Events count:", data.events.length)
  } catch (err) {
    console.error("ERROR for user", p.email, err)
  }
}
