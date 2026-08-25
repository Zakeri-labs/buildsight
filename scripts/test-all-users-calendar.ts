import fs from 'fs'

const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

import { createClient } from '@supabase/supabase-js'
import { getCalendarData } from '../lib/calendar/server'

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: profiles, error: profileErr } = await admin.from('profiles').select('id, email, full_name')
  if (profileErr) {
    console.error("Profiles error:", profileErr)
    return
  }

  console.log(`Found ${profiles.length} profiles. Testing calendar load for all profiles...`)

  let successCount = 0
  let errorCount = 0

  for (const p of profiles) {
    try {
      const data = await getCalendarData({ userId: p.id, monthKey: "2026-08" })
      successCount++
    } catch (err: any) {
      errorCount++
      console.error(`❌ ERROR for user [${p.id}] (${p.email || p.full_name}):`, err?.message || err, err?.stack || '')
    }
  }

  console.log(`\nResults: ${successCount} Successes, ${errorCount} Errors out of ${profiles.length} profiles.`)
}

main().catch(console.error)
