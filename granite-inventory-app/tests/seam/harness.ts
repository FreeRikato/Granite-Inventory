import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import type { Database } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const dbUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const TEST_USERS = {
  admin: { email: "admin@test.local", role: "ADMIN" },
  operator: { email: "operator@test.local", role: "YARD_OPERATOR" },
  stranger: { email: "stranger@test.local", role: null },
} as const;

const PASSWORD = "test-password-123";

export function serviceClient(): Db {
  return createClient<Database>(url, secretKey, { auth: { persistSession: false } });
}

export function anonClient(): Db {
  return createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const pg = new PgClient({ connectionString: dbUrl });
  await pg.connect();
  try {
    const result = await pg.query(text, params);
    return result.rows as T[];
  } finally {
    await pg.end();
  }
}

/* Creates the three test accounts in Auth (idempotent) and puts admin and operator on the
   Team Member list. Domain tables are left to each suite's own seeding. */
export async function ensureTestUsers(): Promise<void> {
  const admin = serviceClient();
  for (const user of Object.values(TEST_USERS)) {
    const { error } = await admin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw error;
  }
  await sql(`delete from public.team_members where email like '%@test.local'`);
  await sql(
    `insert into public.team_members (email, name, role) values ($1, 'Test Admin', 'ADMIN'), ($2, 'Test Operator', 'YARD_OPERATOR')`,
    [TEST_USERS.admin.email, TEST_USERS.operator.email],
  );
}

export async function signedInClient(who: keyof typeof TEST_USERS): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: TEST_USERS[who].email,
    password: PASSWORD,
  });
  if (error) throw error;
  return client;
}

/* Wipes domain data between suites. Team Members, settings and the Walk-in Customer stay. */
export async function resetDomainData(): Promise<void> {
  const tables = await sql<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
       and table_name not in ('team_members', 'settings')`,
  );
  if (tables.length === 0) return;
  const names = tables.map((t) => `public.${t.table_name}`).join(", ");
  await sql(`truncate ${names} restart identity cascade`);
  await sql(`update public.settings set ageing_after_days = 90, stale_after_days = 180, catalog_public = false, whatsapp_number = ''`);
}

export function expectError<T>(result: { error: T | null }): T {
  if (!result.error) throw new Error("Expected an error but the call succeeded");
  return result.error;
}
