# Environments

Three places the app runs. Local is for building, staging is for trying things with throwaway
data, production is Kirthik's real yard.

```
git branch      Vercel environment   Supabase project                    data
-----------------------------------------------------------------------------------------
(none)          local dev server     local Docker stack                  seeded, reset freely
staging         Preview              granite-staging-bom tyiepanibaqwpubajsya  junk, reset freely
main            Production           granite-inventory-bom nugnqzqglldacalkmgyn  real, never reset
```

Both hosted projects are Free tier in ap-south-1 (Mumbai), one hop from the shop instead of an ocean, and share one Google OAuth
client. Vercel functions are pinned to `bom1` in `vercel.json` so every render sits next to
the database.

## Day to day

Build on a feature branch off `staging`. Merge into `staging`, look at
`https://granite-staging.vercel.app`, then open a PR from `staging` into `main`. Merging that
deploys production.

## Migrations

Never edit an applied migration; add a new one with `supabase migration new <name> < /dev/null`
and edit the file. Apply it to staging first, then to production after the PR merges:

```
pnpm db:push:staging
pnpm db:push:prod
```

Each script links the CLI to that project first, so the last one you ran is the project the
CLI still points at. `pnpm db:link:local` unlinks when you want plain local work again.

## Environment variables

Vercel holds the same three names twice, scoped by environment. Production carries the
production project's values, Preview carries staging's.

```
NEXT_PUBLIC_SUPABASE_URL              https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
SUPABASE_SECRET_KEY                   sb_secret_...   (server only)
```

`E2E_TEST_LOGIN` is never set on either; the test-login route exists only on a local dev
server.

`AUTH_TIMING` is off by default; setting it to `1` logs the duration of each auth-chain step
(claims check, Team Member lookup, settings read) as `auth-timing` lines: durations only, never
claim contents or cookies.

## Resetting staging

Staging data is disposable. When it gets messy:

```
supabase link --project-ref tyiepanibaqwpubajsya
supabase db reset --linked
```

Never run that against production. Free projects also pause after seven days of inactivity,
so staging usually needs a Restore click in the dashboard before a session.
