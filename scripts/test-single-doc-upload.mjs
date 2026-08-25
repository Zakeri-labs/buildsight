import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, basename } from "node:path"

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "../.env.local")

if (!existsSync(envPath)) {
  console.error("✗ .env.local not found at:", envPath)
  process.exit(1)
}

const lines = readFileSync(envPath, "utf8").split("\n")
for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const eqIdx = trimmed.indexOf("=")
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, "$1")
  if (!process.env[key]) process.env[key] = val
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("✗ Missing Supabase credentials in .env.local")
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "OK" : "MISSING")
  console.error("SUPABASE_SERVICE_ROLE_KEY:", serviceKey ? "OK" : "MISSING")
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoConfirmUser: true } })

console.log("🔗 Connected to Supabase:", supabaseUrl)

// 1. Find project by code "Bonyan/sup/2023/104" or "2023_104"
const { data: projects, error: projError } = await admin
  .from("projects")
  .select("id, name, code, supervising_organization_id")
  .or("code.eq.Bonyan/sup/2023/104,code.eq.2023_104,code.ilike.%2023/104%")

if (projError || !projects?.length) {
  console.error("✗ Project not found in DB:", projError?.message || "No project matched")
  process.exit(1)
}

const project = projects[0]
console.log(`📁 Project Found: "${project.name}" (Code: ${project.code}, ID: ${project.id})`)

// 2. Find org admin / uploader profile
const { data: memberships } = await admin
  .from("organization_memberships")
  .select("user_id")
  .eq("organization_id", project.supervising_organization_id)
  .eq("role", "org_admin")
  .eq("status", "active")
  .limit(1)

const uploaderId = memberships?.[0]?.user_id
if (!uploaderId) {
  console.error("✗ No active org_admin uploader profile found for organization:", project.supervising_organization_id)
  process.exit(1)
}
console.log(`👤 Uploader Profile: ${uploaderId}`)

// 3. Target test document file
const docPath = join(
  __dir,
  "../Project Docs",
  "jothish Projects Info",
  "2023_104",
  "001_DOCUMENTS",
  "002_AGREEMENTS",
  "001_OWNER CONTRACTOR AGREEMENTS",
  "Contract Agreement - Mr. Zidan Al Najjar.pdf",
)

if (!existsSync(docPath)) {
  console.error("✗ Test file not found on disk at:", docPath)
  process.exit(1)
}

const fileBuffer = readFileSync(docPath)
const originalName = "Contract Agreement - Mr. Zidan Al Najjar.pdf"
const cleanName = "Contract-Agreement_Contract-Agreement-Mr-Zidan-Al-Najjar.pdf"
const category = "contractor_agreement"
const uploadCategory = "contract_agreement"
const docId = crypto.randomUUID()
const storagePath = `${project.id}/${uploaderId}/${docId}/category-${uploadCategory}/${cleanName}`

console.log(`📄 Document: "${originalName}" (${fileBuffer.length} bytes)`)
console.log(`📦 Storage Path: "${storagePath}"`)

// 4. Upload binary buffer to Supabase Storage bucket "initial-docs"
const { error: storageError } = await admin.storage
  .from("initial-docs")
  .upload(storagePath, fileBuffer, {
    contentType: "application/pdf",
    upsert: true,
  })

if (storageError) {
  console.error("✗ Supabase Storage Upload Failed:", storageError.message)
  process.exit(1)
}
console.log("✅ File uploaded to Supabase Storage bucket 'initial-docs'")

// 5. Insert row into public.initial_docs table
const { data: insertedDoc, error: dbError } = await admin
  .from("initial_docs")
  .insert({
    id: docId,
    project_id: project.id,
    file_name: cleanName,
    original_file_name: originalName,
    file_path: storagePath,
    storage_bucket: "initial-docs",
    mime_type: "application/pdf",
    file_size: fileBuffer.length,
    category: category,
    uploaded_by: uploaderId,
  })
  .select()
  .single()

if (dbError) {
  console.error("✗ Database insert into initial_docs failed:", dbError.message)
  process.exit(1)
}

console.log("\n" + "─".repeat(60))
console.log("🎉 Single Document Test Import SUCCESSFUL!")
console.log(`   Document ID    : ${insertedDoc.id}`)
console.log(`   Project        : ${project.name} (${project.code})`)
console.log(`   Original File  : ${insertedDoc.original_file_name}`)
console.log(`   Display Name   : ${insertedDoc.file_name}`)
console.log(`   Category       : ${insertedDoc.category}`)
console.log(`   File Size      : ${insertedDoc.file_size} bytes`)
console.log(`   Storage Path   : ${insertedDoc.file_path}`)
console.log("─".repeat(60) + "\n")
