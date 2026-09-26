---
code:
  - scripts/wt
  - tests/db-lock.ts
  - playwright.config.ts
  - vitest.config.ts
  - package.json
---
# Worktrees

`scripts/wt` prints its own usage. Day to day: `scripts/wt new <branch>`, work in `../granite-wt/<branch>`, then `scripts/wt rm <branch>` once it is merged. [docs/local-dev.md](../local-dev.md) has the walkthrough.

- New branches are created with `--no-track`, so a bare `git push` never targets the base branch.
- Each worktree gets a free port from 3001 upwards in its `.port` file (gitignored). `pnpm dev` and `playwright.config.ts` both read it; without one they use 3000, which is the primary checkout's.
- `rm` refuses unless the branch is merged into `staging` or `main` and the worktree is clean. `--force` overrides both.

## The shared-DB lock

Every worktree on a machine shares the one local Supabase, and both test suites truncate its tables. `tests/db-lock.ts` makes a second run (from any worktree) wait for the first instead of wiping its data mid-run. Vitest and Playwright both accept a global setup whose return value is the teardown, so one file serves both.

- The lock is a directory in the OS temp dir, because `mkdir` is atomic.
- An owner file names the holder's pid and cwd, so a waiting run can say who it is waiting on.
- A lock whose process has died is taken over. A missing owner file means the holder is between `mkdir` and writing the file, so only a dead pid counts as stale. `EPERM` from the liveness probe means the process exists but belongs to someone else, so it counts as alive.

Related: [[testing]].
