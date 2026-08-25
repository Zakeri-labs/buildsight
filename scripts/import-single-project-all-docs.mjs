import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, extname, basename, relative } from "node:path"
import { lookup as mimeLookup } from "mime-types"

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
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoConfirmUser: true } })

const FOLDER_CODE = process.argv[2] || "2023_105"
const BUCKET = "initial-docs"
const PROJ_DIR = join(__dir, "../Project Docs", "jothish Projects Info", FOLDER_CODE)

if (!existsSync(PROJ_DIR)) {
  console.error(`✗ Project folder not found at: ${PROJ_DIR}`)
  process.exit(1)
}

// 1. Find project in DB
const parts = FOLDER_CODE.split("_")
const numPattern = parts.length === 2 ? `${parts[0]}/${parts[1]}` : FOLDER_CODE

const { data: projects, error: projError } = await admin
  .from("projects")
  .select("id, name, code, supervising_organization_id")
  .or(`code.eq.Bonyan/sup/${numPattern},code.eq.${FOLDER_CODE},code.ilike.%${numPattern}%`)

if (projError || !projects?.length) {
  console.error("✗ Project not found in DB:", projError?.message || "No project matched")
  process.exit(1)
}

const project = projects[0]
console.log(`\n📁 Target Project: "${project.name}" (Code: ${project.code}, ID: ${project.id})`)

// 2. Find org admin uploader profile
const { data: memberships } = await admin
  .from("organization_memberships")
  .select("user_id")
  .eq("organization_id", project.supervising_organization_id)
  .eq("role", "org_admin")
  .eq("status", "active")
  .limit(1)

const uploaderId = memberships?.[0]?.user_id
if (!uploaderId) {
  console.error("✗ No active org_admin uploader profile found")
  process.exit(1)
}
console.log(`👤 Uploader Profile: ${uploaderId}\n`)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) results.push(...walkFiles(full))
    else results.push(full)
  }
  return results
}

function resolveCategory(relPath) {
  const lower = relPath.toLowerCase().replace(/\\/g, "/")
  if (lower.includes("001_owner contractor") || lower.includes("contractor agreement")) {
    return { category: "contractor_agreement", uploadCategory: "contract_agreement", prefix: "Contract-Agreement" }
  }
  if (lower.includes("002_owner consultant") || lower.includes("consultant agreement") || lower.includes("supervision agreement") || lower.includes("supervision quotation")) {
    return { category: "consultant_agreement", uploadCategory: "supervision_agreement", prefix: "Supervision-Agreement" }
  }
  if (lower.includes("002_drawings") || lower.includes("drawing")) {
    return { category: "approved_drawings", uploadCategory: "drawing", prefix: "Drawing" }
  }
  if (lower.includes("001_owner documents") || lower.includes("permit") || lower.includes("approval")) {
    return { category: "permits_approvals", uploadCategory: "approval_document", prefix: "Approval" }
  }
  if (lower.includes("schedule")) {
    return { category: "initial_site_reports", uploadCategory: "test_reports", prefix: "Schedule" }
  }
  if (lower.includes("checklist")) {
    return { category: "initial_site_reports", uploadCategory: "test_reports", prefix: "Checklist" }
  }
  return { category: "other", uploadCategory: "additional_documents", prefix: "Doc" }
}

function sanitizeName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^\w.\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "document"
}

function shouldSkip(name) {
  const lower = name.toLowerCase()
  return lower.startsWith("~$") || lower.startsWith("~") || lower.endsWith(".tmp") || lower.endsWith(".lnk") || lower.endsWith(".log")
}

// ─── Execute Import ───────────────────────────────────────────────────────────

const allFiles = walkFiles(PROJ_DIR)
const validFiles = allFiles.filter((f) => !shouldSkip(basename(f)))
console.log(`📦 Found ${validFiles.length} valid documents to upload (skipped ${allFiles.length - validFiles.length} temp/lock files)\n`)

let uploadedCount = 0
let skippedCount = 0
let errorCount = 0

for (const filePath of validFiles) {
  const relPath = relative(PROJ_DIR, filePath)
  const originalName = basename(filePath)
  const ext = extname(originalName)

  const { category, uploadCategory, prefix } = resolveCategory(relPath)
  const nameNoExt = basename(originalName, ext)
  const cleanName = `${prefix}_${sanitizeName(nameNoExt)}${ext.toLowerCase()}`

  // Check if file already exists in database
  const { data: existing } = await admin
    .from("initial_docs")
    .select("id")
    .eq("project_id", project.id)
    .eq("original_file_name", originalName)
    .maybeSingle()

  if (existing) {
    console.log(`   ⏭️  Skipped (Already Imported): "${originalName}"`)
    skippedCount++
    continue
  }

  const fileBuffer = readFileSync(filePath)
  const mimeType = mimeLookup(originalName) || "application/octet-stream"
  const docId = crypto.randomUUID()
  const storagePath = `${project.id}/${uploaderId}/${docId}/category-${uploadCategory}/${cleanName}`

  // 1. Upload to Supabase Storage
  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (storageError) {
    console.error(`   ✗ Storage Error for "${originalName}":`, storageError.message)
    errorCount++
    continue
  }

  // 2. Insert into initial_docs table
  const { error: dbError } = await admin
    .from("initial_docs")
    .insert({
      id: docId,
      project_id: project.id,
      file_name: cleanName,
      original_file_name: originalName,
      file_path: storagePath,
      storage_bucket: BUCKET,
      mime_type: mimeType,
      file_size: fileBuffer.length,
      category: category,
      uploaded_by: uploaderId,
    })

  if (dbError) {
    console.error(`   ✗ DB Error for "${originalName}":`, dbError.message)
    errorCount++
    continue
  }

  console.log(`   ✅ Uploaded: "${originalName}" -> Category: [${category}] (${(fileBuffer.length / 1024).toFixed(1)} KB)`)
  uploadedCount++
}

console.log("\n" + "─".repeat(60))
console.log(`🎉 Project ${FOLDER_CODE} Document Import Complete!`)
console.log(`   Newly Uploaded : ${uploadedCount}`)
console.log(`   Already Exist  : ${skippedCount}`)
console.log(`   Errors         : ${errorCount}`)
console.log("─".repeat(60) + "\n")
