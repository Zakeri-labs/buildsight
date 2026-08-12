/**
 * import-eng-sayd-projects.mjs
 *
 * Reads "Eng.Sayd New  Edition For Supervision.xlsx" from public/ and imports
 * the 59 projects from the "Projects list" sheet into Supabase.
 *
 * Steps:
 *  1. Create/ensure supervisor user account (Ahmed abd elatif al bager)
 *  2. Add supervisor as org_member to the supervising org
 *  3. For each Excel row with a client name:
 *     - Map columns → DB fields (intelligent normalization)
 *     - Skip if project code already exists (idempotent)
 *     - INSERT into public.projects
 *     - INSERT into public.project_owners (client/owner details)
 *     - Assign supervisor via projects.assigned_supervisor_id
 *     - INSERT project_user_memberships for supervisor
 *     - INSERT project_participants consultant mirror row
 *  4. Print summary
 */

import pg from "pg"
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ─── Load .env.local ─────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "../.env.local")
if (existsSync(envPath)) {
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
}

// ─── Supervisor credentials ───────────────────────────────────────────────────
const SUPERVISOR_EMAIL = "ahmed.b@bonyanec.com"
const SUPERVISOR_FULL_NAME = "Ahmed Abd Elatif Al Bager"
const SUPERVISOR_PASSWORD = "Bonyan@Ahmed2025!"

// ─── Supabase admin client (for auth user creation) ──────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoConfirmUser: true } })

// ─── Direct PG connection (for all inserts) ───────────────────────────────────
const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const db = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

// ─── XLSX reader (inline, no extra dep) ──────────────────────────────────────
// We use the xlsx package which is already available in devDependencies vicinity
// Load it dynamically since it may be in node_modules
let XLSX
try {
  XLSX = (await import("xlsx")).default
} catch {
  // Try require style
  const { createRequire } = await import("module")
  const require = createRequire(import.meta.url)
  XLSX = require("xlsx")
}

// ─── Parse Excel ─────────────────────────────────────────────────────────────
const xlsxPath = join(__dir, "../public/Eng.Sayd New  Edition For Supervision.xlsx")
const wb = XLSX.readFile(xlsxPath)
const ws = wb.Sheets["Projects list"]
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

// Headers are at row index 1, data starts at row index 2
// Col indices:
//  0: S/N   1: year   2: number   3: code   4: client name   5: owner contact
//  6: contractor name   7: contractor contact   8: project type   9: plot no
//  10: contract start   11: location   12: supervision type   13: status   14: visits

const dataRows = rawRows.slice(2).filter((r) => r[4] !== "" && r[4] !== null)

console.log(`\n📋 Found ${dataRows.length} project rows in Excel\n`)

// ─── Intelligent Mappers ──────────────────────────────────────────────────────

function mapStatus(raw) {
  if (!raw) return "active"
  const v = String(raw).trim().toLowerCase()
  if (v === "active") return "active"
  if (v === "in-active" || v === "inactive") return "on-hold"
  if (v === "stopped") return "on-hold"
  if (v === "completed") return "completed"
  if (v === "final visit" || v === "take over") return "handover"
  if (v === "not started") return "planning"
  if (v === "cancelled") return "on-hold"
  return "active"
}

function mapSupervisionType(raw) {
  if (!raw) return null
  const v = String(raw).trim().toLowerCase()
  if (v.includes("lump") || v.includes("lum")) return "lump_sum"
  if (v.includes("visit")) return "visit_basic"
  if (v.includes("mont") || v.includes("month")) {
    // Try to parse visits/month from the visits column later; default monthly_4
    return "monthly_4"
  }
  return null
}

function mapSupervisionTypeFromVisits(supervisionRaw, visitsRaw) {
  const baseType = mapSupervisionType(supervisionRaw)
  if (baseType !== "monthly_4") return baseType

  // Parse number from visits column like "4/month", "3/month", "6/month", "2/month"
  if (visitsRaw) {
    const match = String(visitsRaw).match(/(\d+)\s*\/\s*month/i)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n === 2) return "monthly_2"
      if (n === 3) return "monthly_3"
      if (n === 4) return "monthly_4"
    }
  }
  return "monthly_4"
}

function mapProjectType(raw) {
  if (!raw) return "residential"
  const v = String(raw).trim().toLowerCase()
  if (v === "villa" || v === "house" || v === "residential") return "residential"
  if (v === "commercial") return "commercial"
  if (v === "industrial") return "industrial"
  return "residential" // default for this dataset
}

function parsePhone(raw) {
  if (!raw && raw !== 0) return null
  const s = String(raw).replace(/\s/g, "").trim()
  if (!s || s === "0") return null
  return s
}

function parseDate(raw) {
  if (!raw) return null
  // Handle Excel serial date numbers
  if (typeof raw === "number") {
    // Excel date serial: days since 1900-01-01 (with Lotus 1-2-3 bug)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(excelEpoch.getTime() + raw * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  if (!s) return null

  // Parse "1st march2026", "17th jun2026", "1st july 2026", "1st june2026"
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  }
  const m = s.toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]+)\s*(\d{4})/)
  if (m) {
    const day = m[1].padStart(2, "0")
    const month = monthMap[m[2].slice(0, 3)]
    const year = m[3]
    if (month) return `${year}-${month}-${day}`
  }

  // Try standard date parse
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)

  return null
}

function parseStructureVisits(visitsRaw) {
  if (!visitsRaw) return null
  const s = String(visitsRaw).trim()
  // "lum/17" → 17, "4/month" → 4, "lum/30" → 30
  const m = s.match(/(?:lum\/|\/month\s*)?(\d+)/i)
  if (m) return parseInt(m[1], 10)
  return null
}

function buildCode(row) {
  const code = String(row[3] || "").trim()
  if (code) return code
  const year = row[1]
  const num = row[2]
  if (year && num) return `Bonyan/sup/${year}/${num}`
  return null
}

// ─── STEP 1: Create or get supervisor user ────────────────────────────────────
console.log("👤 Step 1: Creating supervisor account...")

let supervisorUserId = null

const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
const existingUser = existingUsers?.users?.find((u) => u.email === SUPERVISOR_EMAIL)

if (existingUser) {
  supervisorUserId = existingUser.id
  console.log(`   ✓ Supervisor already exists: ${SUPERVISOR_EMAIL} (${supervisorUserId})`)
} else {
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: SUPERVISOR_EMAIL,
    password: SUPERVISOR_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: SUPERVISOR_FULL_NAME,
      first_name: "Ahmed",
      last_name: "Al Bager",
    },
  })
  if (createErr) {
    console.error("   ✗ Failed to create supervisor:", createErr.message)
    await db.end()
    process.exit(1)
  }
  supervisorUserId = newUser.user.id
  console.log(`   ✓ Created supervisor: ${SUPERVISOR_EMAIL} (${supervisorUserId})`)
  console.log(`   🔑 Password: ${SUPERVISOR_PASSWORD}`)
}

// Ensure profile row exists
await db.query(
  `INSERT INTO public.profiles (id, email, full_name)
   VALUES ($1, $2, $3)
   ON CONFLICT (id) DO UPDATE SET
     email = EXCLUDED.email,
     full_name = COALESCE(NULLIF(BTRIM(profiles.full_name), ''), EXCLUDED.full_name),
     updated_at = now()`,
  [supervisorUserId, SUPERVISOR_EMAIL, SUPERVISOR_FULL_NAME],
)

// ─── STEP 2: Get supervising org + org_admin creator ─────────────────────────
console.log("\n🏢 Step 2: Fetching supervising organization...")

const orgRes = await db.query(
  `SELECT id, created_by FROM organizations WHERE type = 'supervising' ORDER BY created_at LIMIT 1`,
)
if (!orgRes.rows[0]) {
  console.error("   ✗ No supervising organization found. Complete onboarding first.")
  await db.end()
  process.exit(1)
}
const org = orgRes.rows[0]
const orgId = org.id

// Get org admin as the creator for imports
const adminRes = await db.query(
  `SELECT user_id FROM organization_memberships
   WHERE organization_id = $1 AND role = 'org_admin' AND status = 'active'
   LIMIT 1`,
  [orgId],
)
const creatorId = org.created_by || adminRes.rows[0]?.user_id || supervisorUserId
console.log(`   ✓ Org ID: ${orgId}, Creator: ${creatorId}`)

// ─── STEP 3: Add supervisor as org_member if not already ─────────────────────
console.log("\n🔗 Step 3: Adding supervisor to organization...")

await db.query(
  `INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
   VALUES ($1, $2, 'org_member', 'active')
   ON CONFLICT DO NOTHING`,
  [orgId, supervisorUserId],
)
console.log(`   ✓ Supervisor linked to organization as org_member`)

// ─── STEP 4: Import projects ──────────────────────────────────────────────────
console.log(`\n📦 Step 4: Importing ${dataRows.length} projects...\n`)

let inserted = 0
let skipped = 0
let errors = 0

await db.query("BEGIN")

try {
  let sortOrder = 1000 // Start after existing seed projects

  for (const row of dataRows) {
    const clientName = String(row[4] || "").trim()
    if (!clientName) { skipped++; continue }

    const code = buildCode(row)
    const status = mapStatus(row[13])
    const supervisionType = mapSupervisionTypeFromVisits(row[12], row[14])
    const projectType = mapProjectType(row[8])
    const location = String(row[11] || "").trim() || null
    const plotNo = row[9] ? String(row[9]).trim() : null
    const startDate = parseDate(row[10])
    const contractorName = String(row[6] || "").trim() || null
    const ownerPhone = parsePhone(row[5])
    const contractorPhone = parsePhone(row[7])
    const structureVisits = parseStructureVisits(row[14])

    // Generate project name = client name (as specified by user)
    const projectName = clientName

    // Check for duplicate by code (if code exists)
    if (code) {
      const dupCheck = await db.query(
        `SELECT id FROM public.projects WHERE code = $1 AND supervising_organization_id = $2`,
        [code, orgId],
      )
      if (dupCheck.rows.length > 0) {
        console.log(`   ⚠️  Skip (duplicate code): ${code} — ${projectName}`)
        skipped++
        continue
      }
    }

    // INSERT project
    const projRes = await db.query(
      `INSERT INTO public.projects (
        name, code, location, status,
        supervising_organization_id, created_by,
        our_role, contractor, contractor_phone,
        project_type, supervision_type,
        plot_no, supervision_start_date,
        included_structure_visits,
        assigned_supervisor_id,
        sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,'Consultant',$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`,
      [
        projectName,
        code,
        location,
        status,
        orgId,
        creatorId,
        contractorName,
        contractorPhone,
        projectType,
        supervisionType,
        plotNo,
        startDate,
        structureVisits,
        supervisorUserId,
        sortOrder++,
      ],
    )
    const projectId = projRes.rows[0].id

    // INSERT project owner
    await db.query(
      `INSERT INTO public.project_owners (project_id, owner_order, name, contact_phone)
       VALUES ($1, 1, $2, $3)`,
      [projectId, clientName, ownerPhone],
    )

    // Add supervisor project_user_membership (project_manager role)
    const memberRes = await db.query(
      `INSERT INTO public.project_user_memberships
         (project_id, user_id, organization_id, access_role, status, created_by)
       VALUES ($1, $2, $3, 'project_manager', 'active', $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [projectId, supervisorUserId, orgId, creatorId],
    )
    const membershipId = memberRes.rows[0]?.id ?? null

    // INSERT project_participants consultant mirror for supervisor
    const supervisorProfile = await db.query(
      `SELECT full_name, email FROM public.profiles WHERE id = $1`,
      [supervisorUserId],
    )
    const supervisorName = supervisorProfile.rows[0]?.full_name ?? SUPERVISOR_FULL_NAME
    const supervisorEmail = supervisorProfile.rows[0]?.email ?? SUPERVISOR_EMAIL

    const orgName = (await db.query(`SELECT name FROM public.organizations WHERE id = $1`, [orgId])).rows[0]?.name ?? ""

    await db.query(
      `INSERT INTO public.project_participants (
        project_id, organization_id, organization_name,
        participant_type, project_role, participant_role_label,
        access_membership_id, key_contact_user_id,
        key_contact_name, key_contact_email,
        status, source_key, sort_order, created_by
      ) VALUES ($1,$2,$3,'consultancy','consultant','Supervisor',$4,$5,$6,$7,'active','consultant',10,$8)
      ON CONFLICT (project_id, source_key) DO UPDATE SET
        key_contact_user_id = EXCLUDED.key_contact_user_id,
        key_contact_name = EXCLUDED.key_contact_name,
        key_contact_email = EXCLUDED.key_contact_email,
        access_membership_id = EXCLUDED.access_membership_id,
        updated_at = now()`,
      [
        projectId, orgId, orgName,
        membershipId, supervisorUserId,
        supervisorName, supervisorEmail,
        creatorId,
      ],
    )

    console.log(`   ✅ [${String(inserted + 1).padStart(2, "0")}] ${projectName} (${code ?? "no-code"}) — ${status}`)
    inserted++
  }

  await db.query("COMMIT")
  console.log(`\n${"─".repeat(55)}`)
  console.log(`✅ Import complete!`)
  console.log(`   Inserted : ${inserted}`)
  console.log(`   Skipped  : ${skipped}`)
  console.log(`   Errors   : ${errors}`)
  console.log(`\n🔑 Supervisor credentials:`)
  console.log(`   Email    : ${SUPERVISOR_EMAIL}`)
  console.log(`   Password : ${SUPERVISOR_PASSWORD}`)
  console.log(`   Name     : ${SUPERVISOR_FULL_NAME}`)
  console.log(`${"─".repeat(55)}\n`)
} catch (err) {
  await db.query("ROLLBACK")
  console.error("\n❌ Import failed — rolled back:", err.message)
  console.error(err.stack)
  process.exitCode = 1
} finally {
  await db.end()
}
