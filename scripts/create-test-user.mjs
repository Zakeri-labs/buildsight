import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey, { auth: { autoConfirmUser: true } })

const email = process.argv[2] || "admin@provision.test"
const password = process.argv[3] || "Password123!"

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { first_name: "Arman", last_name: "Haddad" },
})

if (error) {
  if (error.message.includes("already been registered")) {
    console.log("User already exists:", email)
  } else {
    console.error("Error:", error.message)
    process.exit(1)
  }
} else {
  console.log("Created user:", data.user.email, data.user.id)
}
