import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const envPath = join(process.cwd(), ".env.local")
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey, { auth: { autoConfirmUser: true } })

const email = "jothish.a@bonyanec.com"
const newPassword = "Bonyan@2026!"

const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
const user = authUsers?.users?.find((u) => u.email?.toLowerCase() === email)

if (!user) {
  console.error("User not found!")
  process.exit(1)
}

const { data, error } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true,
})

if (error) {
  console.error("Error setting password:", error.message)
} else {
  console.log(`SUCCESS: Password for ${email} has been updated to: ${newPassword}`)
}
