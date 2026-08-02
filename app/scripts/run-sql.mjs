import pg from "pg"
import { readFileSync } from "node:fs"

const file = process.argv[2]
if (!file) {
  console.error("Usage: node scripts/run-sql.mjs <path-to-sql>")
  process.exit(1)
}

const sql = readFileSync(file, "utf8")
const { Client } = pg
const cleanUrl = process.env.POSTGRES_URL_NON_POOLING.split("?")[0]
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(sql)
  console.log(`Applied: ${file}`)
} catch (err) {
  console.error(`Error applying ${file}:`)
  console.error(err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
