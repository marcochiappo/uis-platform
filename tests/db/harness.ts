import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Runs the real Supabase migrations in an in-process Postgres (PGlite) with a
 * minimal stand-in for Supabase's `auth` schema and API roles, so RLS policies,
 * triggers and RPCs are exercised exactly as written.
 */
const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create table auth.users (
    instance_id uuid,
    id uuid primary key,
    aud text, role text,
    email text unique,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb default '{}'::jsonb,
    raw_user_meta_data jsonb default '{}'::jsonb,
    confirmation_token text, recovery_token text,
    email_change text, email_change_token_new text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create table auth.identities (
    id uuid primary key, user_id uuid, provider_id text, provider text,
    identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
`;

export const ROOT = path.resolve(__dirname, "../..");

export async function createTestDb(opts: { seed?: boolean } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create extension if not exists pgcrypto;");
  await db.exec(AUTH_STUB);
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  if (opts.seed) await db.exec(readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8"));
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Create an auth user (as the DB owner), which fires the profile trigger. */
export async function createUser(db: TestDb, id: string, email: string, meta: Record<string, unknown> = {}) {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, JSON.stringify(meta)],
  );
}

/** Run `fn` as an API user with the given JWT subject (null = anon). */
export async function as<T>(db: TestDb, userId: string | null, fn: (tx: TestDb) => Promise<T>): Promise<T> {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(userId ? "set role authenticated;" : "set role anon;");
  try {
    return await fn(db);
  } finally {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
