# Local development

Everything an agent or a person needs to run and test the app without asking anyone. Verified on macato on 11 Sep 2026.

## Layout

```
granite-inventory-management/         project root, not a git repo
  CONTEXT.md                          glossary, read first
  docs/                               meeting notes, tech stack, decisions, ADRs, this file
  .scratch/phase-1/                   spec and tickets (local markdown tracker)
  granite-inventory-app/              the Next.js app, git repo, run all commands from here
    supabase/                         config.toml, migrations, seed.sql, .env (secret, gitignored)
```

## Prerequisites (already installed on macato)

- Docker Desktop, running
- Supabase CLI 2.117 or later, logged in
- pnpm 11, Node 20 or later

## Supabase local stack

```
supabase start        # first run pulls images; later runs take seconds
supabase status       # prints URLs and keys
supabase db reset     # drops, re-applies every migration, runs seed.sql
supabase stop
```

Local URLs: API `http://127.0.0.1:54321`, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.

The local keys are Supabase's fixed demo keys, identical on every machine, safe to commit in test fixtures. Read them with `supabase status -o env`.

## Google sign-in

- Google Cloud project `granite-inventory-508308`, OAuth web client already created with both callbacks: `http://127.0.0.1:54321/auth/v1/callback` (local) and the hosted project callback.
- `supabase/config.toml` has `[auth.external.google]` enabled with the client ID; the secret is read from `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. The CLI loads that file automatically.
- `skip_nonce_check = true` is required for Google on local Supabase.
- Hosted project `ustcpfgubxlugfndwmib` needs the same client ID and secret pasted into its Auth provider settings before the first deploy. That is a handover step, not part of any Phase 1 ticket.

## Next.js env

Create `granite-inventory-app/.env.local` (gitignored) with the values from `supabase status`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from supabase status>
SUPABASE_SECRET_KEY=<SECRET_KEY from supabase status>   # server-only, tests and seeding
```

## Seeded data

`supabase/seed.sql` (created by ticket 01) inserts the first Admin `aravinthanrc@gmail.com`, the single `settings` row (business name "Kirthik Granite", ageing 90, stale 180, catalog off, empty WhatsApp number) and the Walk-in Customer. Swap the Admin email for the client's before handover.

## Testing without a real Google login

The UI shows only "Continue with Google", but local Auth also has the email provider enabled, which tests use to mint sessions:

- Seam tests (Vitest): create users with the secret key via the Auth admin API, one per role (`admin@test.local` on the Team Member list as ADMIN, `operator@test.local` as YARD_OPERATOR, `stranger@test.local` not on the list), sign in with password using supabase-js, and call views and functions as that user. Anonymous tests use the publishable key with no session. Truncate domain tables between tests; `supabase db reset` before the suite.
- Playwright: sign in programmatically with the same email users through a small test-only route or by calling supabase-js in the test and setting the auth cookies, then visit pages. Never drive the real Google consent screen.

## Gotchas met while building

- `supabase migration new <name>` reads the migration body from stdin when stdin is not a TTY and hangs in an agent shell. Redirect stdin: `supabase migration new name < /dev/null`, then edit the file. The same applies to `supabase db reset < /dev/null`.
- A first `supabase db reset` occasionally fails with `LegacyDbSetupError: error running container: exit 1`; running it again succeeds.
- PostgREST matches RPC calls by the set of argument names sent, so every optional function argument needs a SQL default and the client passes `undefined` (not `null`) to omit it.
- `NEXT_PUBLIC_*` variables must be referenced literally (`process.env.NEXT_PUBLIC_X`), never through a computed key, or the browser bundle sees `undefined`.
- Trigger functions in the `private` schema run as the calling role, so `authenticated` has `usage` on that schema; the schema is still not exposed through the API.
- Never run `supabase db reset` while browser QA agents are using the shared stack; it wipes `auth.users` as well as data and every in-flight session breaks.
- Playwright signs in through `POST /auth/test-login` (JSON `{email, password}`), which exists only when `E2E_TEST_LOGIN=1` and never in production builds.

## Non-interactive commands

- shadcn: `pnpm dlx shadcn@latest init --defaults --yes` and `pnpm dlx shadcn@latest add <items> --yes --overwrite`
- Playwright: `pnpm exec playwright install chromium`
- Types: `supabase gen types typescript --local > lib/database.types.ts`
- Migrations: `supabase migration new <name>` then edit the file; never edit an applied migration, add a new one.

## Ports

Next dev on 3000. Supabase uses 54321 to 54324. Nothing else on this machine should be on those ports.
