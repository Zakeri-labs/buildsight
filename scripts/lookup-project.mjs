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

const { data, error } = await admin
  .from("projects")
  .select("id, name, code, client")
  .or(`code.eq.Bonyan/sup/${numPattern},code.eq.${searchCode},code.ilike.%${numPattern}%`)

if (error) {
  console.error("Error:", error.message)
} else if (!data || data.length === 0) {
  // Try searching all 2023 projects to display matches
  const { data: allProj } = await admin
    .from("projects")
    .select("id, name, code, client")
    .or(`code.ilike.%${parts[0]}%`)
    .limit(10)
  console.log(`No exact match for ${searchCode}. Sample ${parts[0]} projects in DB:`, JSON.stringify(allProj, null, 2))
} else {
  console.log(`Exact match for folder ${searchCode}:`, JSON.stringify(data, null, 2))
}
