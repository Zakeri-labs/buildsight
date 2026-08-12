import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "../.env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("="); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1")
    if (!process.env[k]) process.env[k] = v
  }
}

const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const db = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoConfirmUser: true } }
)

console.log("=== INSPECTING TARGET USERS ===")
const emails = [
  "admin@bonyan.test",
  "engineer@provision.test",
  "salman.kh@bonyanec.com",
  "admin@provision.test"
]

const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
const foundAuth = (authUsers?.users ?? []).filter(u => emails.includes(u.email?.toLowerCase()))

console.log("\nAuth Users Found:")
for (const u of foundAuth) {
  console.log(`- ${u.email} | ID: ${u.id}`)
}

const { rows: profiles } = await db.query(
  `SELECT id, email, full_name, avatar_url FROM public.profiles WHERE email = ANY($1)`,
  [emails]
)

console.log("\nProfiles Found:")
for (const p of profiles) {
  console.log(`- ${p.email} | ID: ${p.id} | Name: "${p.full_name}" | Avatar: "${p.avatar_url}"`)
}

await db.end()
