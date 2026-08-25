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

// Increased fetch timeout to 120 seconds for large files
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoConfirmUser: true },
  global: { fetch: (url, opts) => fetch(url, { ...opts, timeout: 120000 }) },
})

const BUCKET = "initial-docs"
const DOCS_ROOT = join(__dir, "../Project Docs", "jothish Projects Info")

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

// 12 Target Files (Under 50MB)
const targetRelPaths = [
  "2025_136/001_DOCUMENTS/002_AGREEMENTS/002_OWNER CONSULTANT AGREEMENTS/Binder1 ARCH + STR. FINAL AMUR AL RASHIDI VILLA.pdf",
  "2025_141/002_DRAWINGS/001-AR_APPROVED/OneDrive_2025-06-24/OneDrive_1_9-10-2025 (1).zip",
  "2025_141/002_DRAWINGS/001-AR_APPROVED/OneDrive_2025-06-24/OneDrive_1_9-10-2025 (2).zip",
  "2025_141/002_DRAWINGS/001-AR_APPROVED/OneDrive_2025-06-24/OneDrive_1_9-10-2025.zip",
  "2025_141/002_DRAWINGS/001-AR_APPROVED/OneDrive_2025-06-24/OneDrive_2025-09-10.zip",
  "2025_141/002_DRAWINGS/001-AR_APPROVED/OneDrive_2025-06-24/structure review.pdf",
  "2025_154/002_DRAWINGS/001-AR_APPROVED/20251013231429542000.pdf",
  "2025_160/002_DRAWINGS/001-AR_APPROVED/Approved Drawings for everything .pdf",
  "2025_163/002_DRAWINGS/001-AR_APPROVED/APPROVED drawing.pdf",
  "2025_168/002_DRAWINGS/001-AR_APPROVED/MR.SULTAN AL SHUKAILI APPROVED SHEETS.pdf",
  "2025_172/002_DRAWINGS/001-AR_APPROVED/Sultanate of Oman.pdf",
  "2026_011/002_DRAWINGS/001-AR_APPROVED/PDF.pdf",
]

console.log(`\n🚀 Retrying Upload for ${targetRelPaths.length} Large Files (15 MB – 40 MB)...\n`)

let successCount = 0
let failCount = 0

for (const relPath of targetRelPaths) {
  const fullPath = join(DOCS_ROOT, relPath.replace(/\//g, "\\"))
  if (!existsSync(fullPath)) {
    console.error(`✗ File not found on disk: ${fullPath}`)
    failCount++
    continue
  }

  const folderName = relPath.split("/")[0]
  const originalName = basename(fullPath)
  const ext = extname(originalName)

  // 1. Lookup project in DB
  const parts = folderName.split("_")
  const numPattern = parts.length === 2 ? `${parts[0]}/${parts[1]}` : folderName
  const altNumPattern = parts.length === 2 ? `${parts[0]}-${parts[1]}` : folderName

  const { data: projects, error: projError } = await admin
    .from("projects")
    .select("id, name, code, supervising_organization_id")
    .or(`code.eq.Bonyan/sup/${numPattern},code.eq.${folderName},code.ilike.%${numPattern}%,code.ilike.%${altNumPattern}%`)
    .limit(1)

  if (projError || !projects?.length) {
    console.error(`✗ DB lookup failed for project folder "${folderName}"`)
    failCount++
    continue
  }

  const project = projects[0]

  // 2. Lookup uploader ID
  const { data: memberships } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", project.supervising_organization_id)
    .eq("role", "org_admin")
    .eq("status", "active")
    .limit(1)

  const uploaderId = memberships?.[0]?.user_id
  if (!uploaderId) {
    console.error(`✗ No active org_admin uploader profile for project "${project.name}"`)
    failCount++
    continue
  }

  const fileBuffer = readFileSync(fullPath)
  const sizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(2)
  const mimeType = mimeLookup(originalName) || "application/octet-stream"

  const { category, uploadCategory, prefix } = resolveCategory(relPath)
  const nameNoExt = basename(originalName, ext)
  const cleanName = `${prefix}_${sanitizeName(nameNoExt)}${ext.toLowerCase()}`

  // Check if already in DB
  const { data: existing } = await admin
    .from("initial_docs")
    .select("id")
    .eq("project_id", project.id)
    .eq("original_file_name", originalName)
    .maybeSingle()

  if (existing) {
    console.log(`   ⏭️  Already in DB: "${originalName}" (${project.name})`)
    successCount++
    continue
  }

  const docId = crypto.randomUUID()
  const storagePath = `${project.id}/${uploaderId}/${docId}/category-${uploadCategory}/${cleanName}`

  console.log(`⏳ Uploading "${originalName}" (${sizeMb} MB) ➔ Project: "${project.name}" (${project.code})...`)

  // Upload with retry logic (up to 3 attempts)
  let uploadSuccess = false
  let lastError = ""

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error: storageError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        })

      if (!storageError) {
        uploadSuccess = true
        break
      }
      lastError = storageError.message
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    console.log(`   ⚠️ Attempt ${attempt} failed, retrying in 3 seconds...`)
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!uploadSuccess) {
    console.error(`   ✗ Storage Upload Failed after 3 attempts: ${lastError}`)
    failCount++
    continue
  }

  // Insert DB row
  const { error: dbError } = await admin.from("initial_docs").insert({
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
    console.error(`   ✗ DB insert failed for "${originalName}":`, dbError.message)
    failCount++
    continue
  }

  console.log(`   ✅ SUCCESS: Uploaded "${originalName}" (${sizeMb} MB) ➔ Project: "${project.name}"`)
  successCount++
}

console.log("\n" + "═".repeat(60))
console.log("🎉 RETRY COMPLETED!")
console.log(`   Successfully Uploaded / Verified : ${successCount}`)
console.log(`   Failed                           : ${failCount}`)
console.log("═".repeat(60) + "\n")
