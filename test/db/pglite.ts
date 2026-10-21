import fs from "node:fs"
import path from "node:path"
import { PGlite, type Transaction } from "@electric-sql/pglite"

const ROOT = path.resolve(__dirname, "../..")

// Minimal stand-ins for what Supabase provides outside the public schema:
// auth.users, auth.uid(), auth.jwt(), the anon/authenticated roles and
// storage.buckets. Everything in public comes from the real migration files.
const SUPABASE_STUBS = `
create schema if not exists auth;
create schema if not exists storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create role anon;
create role authenticated;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
`

const GRANTS = `
grant usage on schema public, auth to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
`

export function readMigration(file: string): string {
  // pgcrypto is built into Postgres 13+ for gen_random_uuid(); PGlite has no extension files.
  return fs.readFileSync(path.join(ROOT, "scripts/sql", file), "utf8").replace(/create extension[^;]*;/gi, "")
}

export async function createTestDb(migrations: string[]): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const file of migrations) {
    await db.exec(readMigration(file))
  }
  await db.exec(GRANTS)
  return db
}

type Actor = { role: "anon" } | { role: "authenticated"; userId: string }

/** Runs `fn` inside a transaction as the given Supabase role, then rolls back. */
export async function as<T>(db: PGlite, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined
  let failure: unknown
  try {
    await db.transaction(async (tx) => {
      await tx.exec(`set local role ${actor.role}`)
      if (actor.role === "authenticated") {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actor.userId])
      }
      try {
        result = await fn(tx)
      } catch (error) {
        failure = error
      }
      await tx.rollback()
    })
  } catch (error) {
    if (!failure) throw error
  }
  if (failure) throw failure
  return result as T
}

export async function createUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [email],
  )
  const id = rows[0].id
  await db.query(`insert into public.profiles (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email])
  return id
}

export async function createOrg(
  db: PGlite,
  name: string,
  type: "supervising" | "external" = "supervising",
  createdAt = new Date().toISOString(),
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.organizations (name, type, created_at) values ($1, $2, $3) returning id`,
    [name, type, createdAt],
  )
  return rows[0].id
}

export async function addMember(
  db: PGlite,
  organizationId: string,
  userId: string,
  role: "org_admin" | "org_manager" | "org_member" | "viewer",
): Promise<void> {
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, $3)`,
    [organizationId, userId, role],
  )
}
