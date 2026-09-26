# Granite Inventory

Stock, sales and customers for Kirthik Granite's yard. Next.js 16 on Vercel, Supabase (Postgres, Auth, RLS) in Mumbai.

```
pnpm dev             # http://127.0.0.1:3000, or this worktree's port from .port
pnpm test            # Vitest seam tests against local Supabase
pnpm test:e2e        # Playwright, desktop and mobile
scripts/wt new <b>   # a ready-to-run worktree in ../granite-wt/<b>
```

Start with `AGENTS.md` for orientation and `docs/local-dev.md` for setup, testing and worktrees. `staging` deploys to the staging project and `main` to production, see `docs/environments.md`.
