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

const BUCKET = "initial-docs"
const DOCS_ROOT = join(__dir, "../Project Docs", "jothish Projects Info")

if (!existsSync(DOCS_ROOT)) {
  console.error(`✗ Documents root folder not found at: ${DOCS_ROOT}`)
  process.exit(1)
}

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

async function findProjectInDb(folderName) {
  const parts = folderName.split("_")
  const numPattern = parts.length === 2 ? `${parts[0]}/${parts[1]}` : folderName
  const altNumPattern = parts.length === 2 ? `${parts[0]}-${parts[1]}` : folderName

  const { data, error } = await admin
    .from("projects")
    .select("id, name, code, supervising_organization_id")
    .or(`code.eq.Bonyan/sup/${numPattern},code.eq.${folderName},code.ilike.%${numPattern}%,code.ilike.%${altNumPattern}%`)
    .limit(1)

  if (error || !data?.length) return null
  return data[0]
}

// ─── Main Execution Loop ──────────────────────────────────────────────────────

const projectFolders = readdirSync(DOCS_ROOT).filter((f) => statSync(join(DOCS_ROOT, f)).isDirectory()).sort()

console.log(`\n🚀 Starting Bulk Project Document Import for ${projectFolders.length} project folders...\n`)

let grandTotalUploaded = 0
let grandTotalSkipped = 0
let grandTotalErrors = 0

const unmatchedFolders = []
const matchedProjects = []

for (let i = 0; i < projectFolders.length; i++) {
  const folderName = projectFolders[i]
  const folderPath = join(DOCS_ROOT, folderName)

  const project = await findProjectInDb(folderName)
  if (!project) {
    console.log(`[${i + 1}/${projectFolders.length}] ⚠️  Folder "${folderName}" — No matching project found in DB`)
    unmatchedFolders.push(folderName)
    continue
  }

  // Get org admin uploader ID for this project's organization
  const { data: memberships } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", project.supervising_organization_id)
    .eq("role", "org_admin")
    .eq("status", "active")
    .limit(1)

  const uploaderId = memberships?.[0]?.user_id
  if (!uploaderId) {
    console.log(`[${i + 1}/${projectFolders.length}] ⚠️  Folder "${folderName}" (${project.name}) — No active org_admin uploader profile`)
    unmatchedFolders.push(`${folderName} (No org_admin profile)`)
    continue
  }

  matchedProjects.push({ folder: folderName, code: project.code, name: project.name })

  const allFiles = walkFiles(folderPath)
  const validFiles = allFiles.filter((f) => !shouldSkip(basename(f)))

  let projUploaded = 0
  let projSkipped = 0
  let projErrors = 0

  for (const filePath of validFiles) {
    const relPath = relative(folderPath, filePath)
    const originalName = basename(filePath)
    const ext = extname(originalName)

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
      projSkipped++
      grandTotalSkipped++
      continue
    }

    const fileBuffer = readFileSync(filePath)
    const mimeType = mimeLookup(originalName) || "application/octet-stream"
    const docId = crypto.randomUUID()
    const storagePath = `${project.id}/${uploaderId}/${docId}/category-${uploadCategory}/${cleanName}`

    // 1. Upload to storage
    const { error: storageError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (storageError) {
      console.error(`     ✗ Storage error [${folderName}]: "${originalName}" — ${storageError.message}`)
      projErrors++
      grandTotalErrors++
      continue
    }

    // 2. Insert into DB table
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
      console.error(`     ✗ DB error [${folderName}]: "${originalName}" — ${dbError.message}`)
      projErrors++
      grandTotalErrors++
      continue
    }

    projUploaded++
    grandTotalUploaded++
  }

  console.log(
    `[${i + 1}/${projectFolders.length}] ✅ Folder "${folderName}" ➔ "${project.name}" (${project.code}): ${projUploaded} uploaded, ${projSkipped} skipped, ${projErrors} errors`,
  )
}

console.log("\n" + "═".repeat(70))
console.log("🎉 BULK PROJECT DOCUMENT IMPORT COMPLETED!")
console.log(`   Total Project Folders Processed : ${projectFolders.length}`)
console.log(`   Matched & Uploaded Projects     : ${matchedProjects.length}`)
console.log(`   Unmatched / Warning Folders     : ${unmatchedFolders.length}`)
console.log(`   Total Files Uploaded            : ${grandTotalUploaded}`)
console.log(`   Total Files Skipped             : ${grandTotalSkipped}`)
console.log(`   Total Errors                    : ${grandTotalErrors}`)
console.log("═".repeat(70))

if (unmatchedFolders.length > 0) {
  console.log("\n⚠️  Unmatched Folders Summary:")
  unmatchedFolders.forEach((uf) => console.log(`   - ${uf}`))
}
console.log("\n")
