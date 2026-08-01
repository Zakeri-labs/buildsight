import pg from "pg"

const { Client } = pg
const rawUrl = process.env.POSTGRES_URL_NON_POOLING
const cleanUrl = rawUrl.split("?")[0]
const client = new Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const tables = await client.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name;
`)
console.log("=== public tables ===")
console.log(tables.rows.map((r) => r.table_name).join("\n") || "(none)")

for (const { table_name } of tables.rows) {
  const cols = await client.query(
    `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema='public' and table_name=$1
     order by ordinal_position;`,
    [table_name],
  )
  console.log(`\n--- ${table_name} ---`)
  for (const c of cols.rows) {
    console.log(`  ${c.column_name} ${c.data_type} ${c.is_nullable === "NO" ? "NOT NULL" : ""}`)
  }
}

const authUsers = await client.query(`select count(*)::int as n from auth.users;`)
console.log(`\n=== auth.users count: ${authUsers.rows[0].n} ===`)

await client.end()
