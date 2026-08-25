import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, basename } from "node:path"

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

const root = join(__dir, "../Project Docs", "jothish Projects Info")
const limit = 15 * 1024 * 1024
const largeFiles = []

function walk(dir, projFolder) {
  for (const f of readdirSync(dir)) {
    const fp = join(dir, f)
    const st = statSync(fp)
    if (st.isDirectory()) walk(fp, projFolder)
    else if (!f.startsWith("~$") && !f.startsWith("~") && !f.endsWith(".tmp") && !f.endsWith(".lnk")) {
      if (st.size > limit) {
        largeFiles.push({ folder: projFolder, file: f, sizeMb: parseFloat((st.size / (1024 * 1024)).toFixed(2)) })
      }
    }
  }
}

const projDirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory())
for (const p of projDirs) walk(join(root, p), p)

const { data: dbDocs, error } = await admin
  .from("initial_docs")
  .select("id, original_file_name, file_size")

if (error) {
  console.error("DB Error:", error.message)
  process.exit(1)
}

const dbMap = new Set(dbDocs.map((d) => d.original_file_name))

const uploaded = largeFiles.filter((f) => dbMap.has(f.file))
const missing = largeFiles.filter((f) => !dbMap.has(f.file))

console.log("\n=======================================================")
console.log(`Total Large Files (> 15 MB) : ${largeFiles.length}`)
console.log(`Successfully Uploaded in DB : ${uploaded.length}`)
console.log(`Not Uploaded (Missing)       : ${missing.length}`)
console.log("=======================================================\n")

console.log("📌 UPLOADED (> 15 MB and <= 50 MB):")
uploaded.forEach((f) => console.log(`   ✅ [${f.folder}] ${f.file} (${f.sizeMb} MB)`))

console.log("\n📌 NOT UPLOADED (> 50 MB or unallowed format):")
missing.forEach((f) => console.log(`   ❌ [${f.folder}] ${f.file} (${f.sizeMb} MB)`))
console.log("\n")
