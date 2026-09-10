import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "../.env.local")

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eqIdx = t.indexOf("=")
    if (eqIdx === -1) continue
    const key = t.slice(0, eqIdx).trim()
    const val = t.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, "$1")
    if (!process.env[key]) process.env[key] = val
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoConfirmUser: true } })

const searchCode = process.argv[2] || "2023_105"
const parts = searchCode.split("_")
const numPattern = parts.length === 2 ? `${parts[0]}/${parts[1]}` : searchCode

const { data: projects, error } = await admin
  .from("projects")
  .select("id, name, code, status, supervision_type, assigned_supervisor_id, created_at, updated_at")
  .in("id", ["db8a1600-2a7b-419a-b27d-628781d3e24c", "3cba5495-225c-4af5-83ea-0bc965bfa62a"])

console.log("PROJECTS:", JSON.stringify(projects, null, 2))

const { data: participants } = await admin
  .from("project_participants")
  .select("id, project_id, key_contact_user_id, status, participant_type, project_role, participant_role_label, source_key")
  .in("project_id", ["db8a1600-2a7b-419a-b27d-628781d3e24c", "3cba5495-225c-4af5-83ea-0bc965bfa62a"])

console.log("PARTICIPANTS:", JSON.stringify(participants, null, 2))

const userIds = [...new Set([
  ...(projects || []).map(p => p.assigned_supervisor_id),
  ...(participants || []).map(p => p.key_contact_user_id)
].filter(Boolean))]

const { data: profiles } = await admin
  .from("profiles")
  .select("id, full_name, email")
  .in("id", userIds)

console.log("PROFILES:", JSON.stringify(profiles, null, 2))

