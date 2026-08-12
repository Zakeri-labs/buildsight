/**
 * backfill-participants.mjs
 *
 * Reads the Excel and for every imported project that already exists in DB:
 *  - Inserts a project_participant row for the CLIENT (owner) via project_owners
 *  - Inserts a project_participant row for the CONTRACTOR (if name exists)
 *
 * Safe to re-run — uses ON CONFLICT DO UPDATE.
 */

import pg from "pg"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ─── Load .env.local ──────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "../.env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1")
    if (!process.env[k]) process.env[k] = v
  }
}

// ─── DB ───────────────────────────────────────────────────────────────────────
const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const db = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

// ─── XLSX ─────────────────────────────────────────────────────────────────────
let XLSX
try {
  XLSX = (await import("xlsx")).default
} catch {
  const { createRequire } = await import("module")
  XLSX = createRequire(import.meta.url)("xlsx")
}

const xlsxPath = join(__dir, "../public/Eng.Sayd New  Edition For Supervision.xlsx")
const wb = XLSX.readFile(xlsxPath)
const ws = wb.Sheets["Projects list"]
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

// Col indices:
//  0:S/N  1:year  2:num  3:code  4:client  5:ownerPhone
//  6:contractorName  7:contractorPhone  8:projType  9:plotNo
//  10:contractStart  11:location  12:supervisionType  13:status  14:visits
const dataRows = rawRows.slice(2).filter((r) => r[4] !== "" && r[4] !== null)

function parsePhone(raw) {
  if (!raw && raw !== 0) return null
  const s = String(raw).replace(/\s/g, "").trim()
  return s && s !== "0" ? s : null
}

function buildCode(row) {
  const code = String(row[3] || "").trim()
  if (code) return code
  const year = row[1]
  const num = row[2]
  if (year && num) return `Bonyan/sup/${year}/${num}`
  return null
}

// ─── Fetch supervising org ────────────────────────────────────────────────────
const orgRes = await db.query(
  `SELECT id, created_by FROM organizations WHERE type = 'supervising' ORDER BY created_at LIMIT 1`,
)
if (!orgRes.rows[0]) {
  console.error("✗ No supervising org found")
  await db.end()
  process.exit(1)
}
const orgId = orgRes.rows[0].id
const creatorId =
  orgRes.rows[0].created_by ||
  (
    await db.query(
      `SELECT user_id FROM organization_memberships WHERE organization_id=$1 AND role='org_admin' AND status='active' LIMIT 1`,
      [orgId],
    )
  ).rows[0]?.user_id

console.log(`\n🏢 Org: ${orgId}  Creator: ${creatorId}\n`)

// ─── Process each Excel row ───────────────────────────────────────────────────
let clientsAdded = 0
let contractorsAdded = 0
let notFound = 0
let skipped = 0

await db.query("BEGIN")

try {
  for (const row of dataRows) {
    const clientName = String(row[4] || "").trim()
    if (!clientName) { skipped++; continue }

    const code = buildCode(row)
    const contractorName = String(row[6] || "").trim() || null
    const ownerPhone = parsePhone(row[5])
    const contractorPhone = parsePhone(row[7])

    // Find the project in DB by code
    if (!code) { skipped++; continue }
    const projRes = await db.query(
      `SELECT id, created_by FROM public.projects WHERE code = $1 AND supervising_organization_id = $2`,
      [code, orgId],
    )
    if (!projRes.rows[0]) {
      console.log(`   ⚠️  Not found in DB: ${code}`)
      notFound++
      continue
    }
    const projectId = projRes.rows[0].id
    const projectCreatedBy = projRes.rows[0].created_by || creatorId

    // ── 1. CLIENT participant via project_owners ──────────────────────────────
    // Upsert project_owners first (idempotent)
    const ownerRes = await db.query(
      `INSERT INTO public.project_owners (project_id, owner_order, name, contact_phone)
       VALUES ($1, 1, $2, $3)
       ON CONFLICT (project_id, owner_order) DO UPDATE SET
         name = EXCLUDED.name,
         contact_phone = COALESCE(EXCLUDED.contact_phone, project_owners.contact_phone),
         updated_at = now()
       RETURNING id`,
      [projectId, clientName, ownerPhone],
    )
    const ownerId = ownerRes.rows[0].id

    // Insert client participant linked to project_owners row
    await db.query(
      `INSERT INTO public.project_participants (
         project_id,
         organization_name,
         participant_type,
         project_role,
         key_contact_name,
         key_contact_phone,
         status,
         source_key,
         sort_order,
         created_by
       ) VALUES ($1, $2, 'client', 'client', $3, $4, 'active', $5, 21, $6)
       ON CONFLICT (project_id, source_key) DO UPDATE SET
         organization_name = EXCLUDED.organization_name,
         key_contact_name  = EXCLUDED.key_contact_name,
         key_contact_phone = COALESCE(EXCLUDED.key_contact_phone, project_participants.key_contact_phone),
         updated_at        = now()`,
      [
        projectId,
        clientName,
        clientName,
        ownerPhone,
        `owner:${ownerId}`,
        projectCreatedBy,
      ],
    )
    clientsAdded++

    // ── 2. CONTRACTOR participant ─────────────────────────────────────────────
    if (contractorName) {
      await db.query(
        `INSERT INTO public.project_participants (
           project_id,
           organization_name,
           participant_type,
           project_role,
           contractor_role,
           key_contact_phone,
           status,
           source_key,
           sort_order,
           created_by
         ) VALUES ($1, $2, 'contractor', 'contractor', 'main_contractor', $3, 'active', 'contractor', 40, $4)
         ON CONFLICT (project_id, source_key) DO UPDATE SET
           organization_name = EXCLUDED.organization_name,
           contractor_role   = EXCLUDED.contractor_role,
           key_contact_phone = COALESCE(EXCLUDED.key_contact_phone, project_participants.key_contact_phone),
           updated_at        = now()`,
        [projectId, contractorName, contractorPhone, projectCreatedBy],
      )
      contractorsAdded++
    }

    const contractorInfo = contractorName ? `  🏗️  ${contractorName}` : "  (no contractor)"
    console.log(`   ✅ ${code} | 👤 ${clientName}${contractorInfo}`)
  }

  await db.query("COMMIT")
  console.log(`\n${"─".repeat(60)}`)
  console.log(`✅ Backfill complete!`)
  console.log(`   Client participants added/updated  : ${clientsAdded}`)
  console.log(`   Contractor participants added/updated: ${contractorsAdded}`)
  console.log(`   Projects not found in DB           : ${notFound}`)
  console.log(`   Skipped (no code/name)             : ${skipped}`)
  console.log(`${"─".repeat(60)}\n`)
} catch (err) {
  await db.query("ROLLBACK")
  console.error("\n❌ Backfill failed — rolled back:", err.message)
  console.error(err.stack)
  process.exitCode = 1
} finally {
  await db.end()
}
