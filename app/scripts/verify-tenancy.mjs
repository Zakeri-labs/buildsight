import pg from "pg"
const { Client } = pg
const url = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const [label, q] of [
  ["organizations", "select id, name, type, status from public.organizations"],
  ["memberships", "select organization_id, user_id, role, status from public.organization_memberships"],
  ["profiles", "select id, first_name, last_name from public.profiles"],
  ["audit", "select action, entity_type from public.audit_log order by created_at desc limit 5"],
]) {
  const { rows } = await client.query(q)
  console.log(`\n== ${label} (${rows.length}) ==`)
  console.table(rows)
}
await client.end()
