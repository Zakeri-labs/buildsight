/**
 * upload-project-docs.mjs
 *
 * Reads all files from public/Docs/<year-num>/ and for each project folder:
 *  1. Matches the folder code (e.g. 2025-22 → Bonyan/sup/2025/22) to DB project
 *  2. Uploads each file to Supabase Storage bucket "initial-docs"
 *     Path: <project_id>/category-<category>/<clean-filename>
 *  3. Inserts a row in public.initial_docs for each file
 *
 * Category mapping from folder path:
 *   001_DOCUMENTS/001_OWNER DOCUMENTS  → other
 *   001_DOCUMENTS/002_AGREEMENTS/001_OWNER CONTRACTOR AGREEMENTS → contractor_agreement
 *   001_DOCUMENTS/002_AGREEMENTS/002_OWNER CONSULTANT AGREEMENTS → consultant_agreement
 *   001_DOCUMENTS/002_AGREEMENTS/003_PAYMENT DETAILS             → other
 *   002_DRAWINGS/001-AR_APPROVED       → approved_drawings
 *   002_DRAWINGS/002-ST_APPROVED       → approved_drawings
 *   002_DRAWINGS/003-AR_FOR CONSTRUCTION → approved_drawings
 *   002_DRAWINGS/004-ST_FOR CONSTUCTION  → approved_drawings
 *   002_DRAWINGS/005-EL_FINAL / 005-MH_FINAL → approved_drawings
 *   002_DRAWINGS/approved MEP drawing   → approved_drawings
 *   003_SCHEDULE OF VISIT               → other
 *   004_WORK CHECKLISTS                 → other
 *   CONTACT DETAILS.xlsx (root)         → other
 *
 * File naming: <CategoryPrefix>_<OriginalName> (sanitized)
 * Skip: .tmp, ~$ temp files
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, extname, basename, relative } from "node:path"
import { lookup as mimeLookup } from "mime-types"

// ─── Load .env.local ──────────────────────────────────────────────────────────
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoConfirmUser: true } })

const BUCKET = "initial-docs"
const DOCS_ROOT = join(__dir, "../public/Docs")
const ORG_TYPE = "supervising"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively list all files under a directory */
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

/** Map folder path segments to initial_doc category */
function resolveCategory(relPath) {
  const lower = relPath.toLowerCase().replace(/\\/g, "/")
  if (lower.includes("001_owner contractor") || lower.includes("contractor agreement")) return "contractor_agreement"
  if (lower.includes("002_owner consultant") || lower.includes("consultant agreement") || lower.includes("supervision agreement")) return "consultant_agreement"
  if (lower.includes("002_drawings") || lower.includes("approved") || lower.includes("drawing") || lower.includes("mep drawing")) return "approved_drawings"
  if (lower.includes("permit") || lower.includes("approval_document") || lower.includes("license")) return "permits_approvals"
  if (lower.includes("schedule")) return "other"
  if (lower.includes("checklist")) return "other"
  if (lower.includes("payment") || lower.includes("invoice")) return "other"
  if (lower.includes("owner document")) return "other"
  return "other"
}

/** Upload category key for storage path */
function uploadCategoryFromDocCategory(cat) {
  const map = {
    contractor_agreement: "contract_agreement",
    consultant_agreement: "supervision_agreement",
    approved_drawings: "drawing",
    permits_approvals: "approval_document",
    other: "additional_documents",
  }
  return map[cat] ?? "additional_documents"
}

/** Category display prefix for filename */
function categoryPrefix(cat) {
  const map = {
    contractor_agreement: "Contract-Agreement",
    consultant_agreement: "Supervision-Agreement",
    approved_drawings: "Drawing",
    permits_approvals: "Approval",
    other: "Doc",
  }
  return map[cat] ?? "Doc"
}

/** Sanitize filename — ASCII only, no spaces */
function sanitizeName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")       // strip non-ASCII
    .replace(/[^\w.\-]/g, "-")            // replace unsafe chars
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "document"
}

/** Check if file should be skipped */
function shouldSkip(name) {
  const lower = name.toLowerCase()
  return lower.startsWith("~$") || lower.endsWith(".tmp") || lower.endsWith(".log")
}

/** Get project UUID from DB by code pattern */
async function findProject(db, orgId, folderName) {
  // folderName is like "2025-22" → code = "Bonyan/sup/2025/22"
  const parts = folderName.split("-")
  if (parts.length < 2) return null
  const [year, num] = [parts[0], parts.slice(1).join("-")]
  const code = `Bonyan/sup/${year}/${num}`
  const { data, error } = await db
    .from("projects")
    .select("id, name, code")
    .eq("code", code)
    .eq("supervising_organization_id", orgId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// 1. Get supervising org
const { data: orgs } = await admin.from("organizations").select("id").eq("type", ORG_TYPE).limit(1)
if (!orgs?.[0]) { console.error("✗ No supervising org"); process.exit(1) }
const orgId = orgs[0].id

// 2. Get uploader (org admin or supervisor)
const { data: memberships } = await admin
  .from("organization_memberships")
  .select("user_id")
  .eq("organization_id", orgId)
  .eq("role", "org_admin")
  .eq("status", "active")
  .limit(1)
const uploaderId = memberships?.[0]?.user_id
if (!uploaderId) { console.error("✗ No org admin found"); process.exit(1) }
console.log(`\n🏢 Org: ${orgId}  Uploader: ${uploaderId}\n`)

// 3. List project folders
const projectFolders = readdirSync(DOCS_ROOT).filter(f => statSync(join(DOCS_ROOT, f)).isDirectory())
console.log(`📁 Found ${projectFolders.length} project folders\n`)

let totalUploaded = 0
let totalSkipped = 0
let totalErrors = 0

for (const folderName of projectFolders.sort()) {
  const folderPath = join(DOCS_ROOT, folderName)
  
  // Find project in DB
  const project = await findProject(admin, orgId, folderName)
  if (!project) {
    console.log(`   ⚠️  [${folderName}] No matching project in DB — skipped`)
    continue
  }

  const allFiles = walkFiles(folderPath)
  const validFiles = allFiles.filter(f => !shouldSkip(basename(f)))
  
  console.log(`📂 [${folderName}] → "${project.name}" (${project.id}) — ${validFiles.length} files`)

  let projUploaded = 0
  let projSkipped = 0

  for (const filePath of validFiles) {
    const relPath = relative(folderPath, filePath)
    const originalName = basename(filePath)
    const ext = extname(originalName)
    
    // Determine category
    const category = resolveCategory(relPath)
    const uploadCategory = uploadCategoryFromDocCategory(category)
    const prefix = categoryPrefix(category)
    
    // Build clean filename
    const nameNoExt = basename(originalName, ext)
    const cleanName = `${prefix}_${sanitizeName(nameNoExt)}${ext.toLowerCase()}`
    
    // Storage path: <project_id>/category-<uploadCategory>/<cleanName>
    const storagePath = `${project.id}/category-${uploadCategory}/${cleanName}`
    
    // Read file
    const fileBuffer = readFileSync(filePath)
    const mimeType = mimeLookup(originalName) || "application/octet-stream"
    
    // Check if already uploaded (idempotent)
    const { data: existing } = await admin
      .from("initial_docs")
      .select("id")
      .eq("project_id", project.id)
      .eq("file_path", storagePath)
      .maybeSingle()
    
    if (existing) {
      projSkipped++
      continue
    }

    // Upload to storage
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })
    
    if (uploadError) {
      console.error(`     ✗ Upload error: ${cleanName} — ${uploadError.message}`)
      totalErrors++
      continue
    }

    // Insert into initial_docs table
    const { error: dbError } = await admin
      .from("initial_docs")
      .insert({
        project_id: project.id,
        file_name: cleanName,
        original_file_name: originalName,
        file_path: storagePath,
        mime_type: mimeType,
        file_size: fileBuffer.length,
        category: category,
        uploaded_by: uploaderId,
      })
    
    if (dbError) {
      // If conflict, just skip
      if (dbError.code === "23505") { projSkipped++; continue }
      console.error(`     ✗ DB error: ${cleanName} — ${dbError.message}`)
      totalErrors++
      continue
    }

    console.log(`     ✅ ${cleanName}  [${category}]`)
    projUploaded++
    totalUploaded++
  }

  console.log(`     → ${projUploaded} uploaded, ${projSkipped} already existed\n`)
  totalSkipped += projSkipped
}

console.log(`${"─".repeat(60)}`)
console.log(`✅ Upload complete!`)
console.log(`   Uploaded  : ${totalUploaded}`)
console.log(`   Skipped   : ${totalSkipped}`)
console.log(`   Errors    : ${totalErrors}`)
console.log(`${"─".repeat(60)}\n`)
