---
code:
  - vitest.config.ts
  - playwright.config.ts
  - tests/seam/harness.ts
  - tests/seam/fixtures.ts
  - tests/seam/db-lock.test.ts
  - tests/e2e/fixtures.ts
  - tests/e2e/capture.spec.ts
  - tests/e2e/theme.spec.ts
  - tests/tooling/comments.test.ts
---
# Testing

Two suites, both against the local Supabase. [docs/local-dev.md](../local-dev.md) covers setup.

- **Seam (Vitest)** for rules and RLS, the primary seam. Every file talks to the same database, so files run one at a time and the run holds the shared-DB lock ([[worktrees]]). `tests/tooling` holds the pure unit tests for repo tooling and runs in the same suite.
- **E2E (Playwright)** holds one thin flow per ticket (wiring, not rules). It runs desktop and mobile projects on this worktree's port, and holds the same lock.

## Seam harness

`ensureTestUsers()` creates the three test accounts in Auth (idempotent) and puts admin and operator on the Team Member list; the stranger stays off it. Domain tables are left to each suite's own seeding, and `resetDomainData()` wipes them between suites while Team Members, settings and the Walk-in Customer stay. The fixtures are small domain builders that each return ids for the next call, and they speak the [[ist-calendar]].

The lock tests use a fresh lock directory per test so they never contend with the real lock the suite holds. The stale-owner case uses pid 2^22 + 1, which is above the default pid ceiling on macOS and Linux, so nothing is running there.

## Test sign-in

The UI only offers Google, which cannot be automated. E2E signs in through the test-only route ([[auth-session]]).

## Hydration guards

On a cold dev server, a click or keypress that lands before a client component hydrates is dropped silently. The e2e helpers therefore retry until the effect is visible:

- `openDialog` clicks a trigger until its dialog shows.
- `openPalette` presses the shortcut until the palette opens.
- The theme spec clicks the toggle until the `html` class flips, since a single click is not enough to assert on.
- `confirmDelete` needs the most care: the trigger and the confirmation carry the same label, so a click that lands before hydration leaves the second click hitting the trigger again instead of confirming.

## Not a test

`capture.spec.ts` is not a behaviour test. It captures pages for a side-by-side check against the Pencil designs and only runs with `CAPTURE=<dir> pnpm exec playwright test capture --project=desktop`.

Specs with non-obvious intent are explained where their subject lives: [[browser-reads]], [[yard]], [[readable-refusals]], [[dashboard]], [[corrections]].
