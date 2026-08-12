import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

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

const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const db = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoConfirmUser: true } }
)

const SALMAN_EMAIL = "salman.kh@bonyanec.com"
const ARMAN_EMAIL = "admin@provision.test"
const DELETE_EMAILS = ["admin@bonyan.test", "engineer@provision.test", SALMAN_EMAIL]

console.log("=== STEP 1: TRANSFER SALMAN'S NAME & AVATAR TO ARMAN HADDAD ===")

const salmanRes = await db.query(`SELECT id, full_name, avatar_url FROM public.profiles WHERE email = $1`, [SALMAN_EMAIL])
const armanRes = await db.query(`SELECT id, full_name, avatar_url FROM public.profiles WHERE email = $1`, [ARMAN_EMAIL])

const salman = salmanRes.rows[0]
const arman = armanRes.rows[0]

if (!arman) {
  console.error("Could not find Arman profile.")
  process.exit(1)
}

if (salman) {
  console.log(`Salman ID: ${salman.id}, Name: "${salman.full_name}", Avatar: "${salman.avatar_url}"`)
  let newArmanAvatarUrl = arman.avatar_url

  if (salman.avatar_url) {
    console.log("Copying avatar in storage bucket user-avatars...")
    const { data: fileData, error: downloadError } = await admin.storage.from("user-avatars").download(salman.avatar_url)
    if (downloadError) {
      console.error("Avatar download error:", downloadError.message)
    } else {
      const filename = salman.avatar_url.split("/").pop()
      const targetPath = `${arman.id}/${filename}`
      const buffer = Buffer.from(await fileData.arrayBuffer())
      
      const { error: uploadError } = await admin.storage.from("user-avatars").upload(targetPath, buffer, {
        contentType: fileData.type || "image/png",
        upsert: true,
      })
      
      if (uploadError) {
        console.error("Avatar upload error:", uploadError.message)
      } else {
        newArmanAvatarUrl = targetPath
        console.log(`✓ Uploaded avatar to: ${targetPath}`)
      }
    }
  }

  const newArmanName = salman.full_name || "Salman Kh"

  await db.query(
    `UPDATE public.profiles SET full_name = $1, avatar_url = $2, updated_at = now() WHERE id = $3`,
    [newArmanName, newArmanAvatarUrl, arman.id]
  )

  await admin.auth.admin.updateUserById(arman.id, {
    user_metadata: {
      full_name: newArmanName,
    }
  })

  console.log(`✓ Arman Haddad profile updated to Name: "${newArmanName}", Avatar: "${newArmanAvatarUrl}"`)
}

console.log("\n=== STEP 2: FINDING ALL FOREIGN KEY REFERENCES TO PROFILES ===")

const fkRes = await db.query(`
  SELECT
      tc.table_name, 
      kcu.column_name
  FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND ccu.table_name='profiles'
    AND ccu.column_name='id'
    AND tc.table_schema='public';
`)

console.log("Foreign keys referencing profiles(id):", fkRes.rows)

for (const email of DELETE_EMAILS) {
  const pRes = await db.query(`SELECT id FROM public.profiles WHERE email = $1`, [email])
  const user = pRes.rows[0]
  const userId = user?.id

  console.log(`\nProcessing deletion for: ${email} (${userId || "no profile"})...`)

  if (userId) {
    for (const fk of fkRes.rows) {
      const table = fk.table_name
      const col = fk.column_name

      if (table === "organization_memberships" || table === "project_user_memberships" || table === "site_visit_request_assignees") {
        const res = await db.query(`DELETE FROM public."${table}" WHERE "${col}" = $1`, [userId])
        console.log(`   - Deleted ${res.rowCount} rows from ${table}`)
      } else if (table === "projects" && col === "assigned_supervisor_id") {
        const res = await db.query(`UPDATE public.projects SET assigned_supervisor_id = $1 WHERE assigned_supervisor_id = $2`, [arman.id, userId])
        console.log(`   - Reassigned ${res.rowCount} rows in ${table}.${col} to Arman`)
      } else {
        // Nullify or reassign to Arman depending on column nullability
        try {
          const res = await db.query(`UPDATE public."${table}" SET "${col}" = NULL WHERE "${col}" = $1`, [userId])
          console.log(`   - Nullified ${res.rowCount} rows in ${table}.${col}`)
        } catch {
          const res = await db.query(`UPDATE public."${table}" SET "${col}" = $1 WHERE "${col}" = $2`, [arman.id, userId])
          console.log(`   - Reassigned ${res.rowCount} rows in ${table}.${col} to Arman`)
        }
      }
    }

    const delProfile = await db.query(`DELETE FROM public.profiles WHERE id = $1`, [userId])
    console.log(`   - Deleted ${delProfile.rowCount} profiles row`)
  }

  // Delete from Supabase Auth
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (authUser) {
    const { error: authDelErr } = await admin.auth.admin.deleteUser(authUser.id)
    if (authDelErr) {
      console.error(`   ✗ Auth delete error for ${email}:`, authDelErr.message)
    } else {
      console.log(`   ✓ Deleted auth.users record for ${email} (${authUser.id})`)
    }
  } else {
    console.log(`   No auth.users record found for ${email}`)
  }
}

console.log("\n✅ ALL ACCOUNTS PROCESSED SUCCESSFULLY!")
await db.end()
