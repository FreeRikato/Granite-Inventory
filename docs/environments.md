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
`https://staging-granite-inventory.vercel.app`, then open a PR from `staging` into `main`. Merging that
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

## Resetting staging

Staging data is disposable. When it gets messy:

```
supabase link --project-ref tyiepanibaqwpubajsya
supabase db reset --linked
```

Never run that against production.

## Keep-alive

Free projects pause after seven days of inactivity, and a paused project stays down until
someone clicks Restore in the dashboard. `.github/workflows/supabase-keep-alive.yml` reads one
row of `v_public_business` from staging every day at 03:17 UTC, so it never goes idle long
enough to pause. A request that reaches Postgres counts as activity; a ping that stops at the
API gateway might not, which is why it reads a view instead of a health endpoint.

It needs two repository secrets, the same values Vercel holds for Preview:

```
SUPABASE_STAGING_URL
SUPABASE_STAGING_PUBLISHABLE_KEY
```

Prod joins once staging has proved it: add `PROD` to the job's `project` list and set
`SUPABASE_PROD_URL` and `SUPABASE_PROD_PUBLISHABLE_KEY`.

GitHub runs scheduled workflows only from the default branch (`main`), and turns them off in a
public repo after 60 days without a commit. A failed run emails whoever last edited the
workflow's schedule. Actions, then Supabase keep-alive, **Run workflow** runs it by hand.
