<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Granite Inventory: project orientation

This app lives inside a parent folder that holds the design docs. Before starting any ticket, read in this order (paths relative to the parent folder `..`):

1. `../CONTEXT.md` — the glossary; use its terms in code, names and copy
2. `../docs/phase1_decisions.md` — business rules, KPI formulas, malleability principles
3. `../docs/adr/` — decisions not to reopen (rules live in Postgres functions; a Sale is one Batch)
4. `../docs/tech_stack.md` — the stack
5. `../docs/local-dev.md` — how to run Supabase locally, env vars, how tests sign in, non-interactive CLI flags
6. `../.scratch/phase-1/spec.md` and `../.scratch/phase-1/issues/` — the spec and the ticket you are implementing

Working rules:

- Do not ask the user for setup facts; everything needed is in `local-dev.md`. Docker Desktop and the Supabase CLI are installed; run `supabase start` if the stack is down.
- No Postgres enum types; use text with check constraints. Store raw facts, derive in views.
- Tests: Vitest against local Supabase for rules and RLS (primary seam); Playwright holds one thin flow per ticket (wiring, not rules) plus `capture.spec.ts`, a screenshot tool for design comparison that only runs with `CAPTURE=<dir>`.
- Update `../CONTEXT.md` and `../docs/phase1_decisions.md` in the same commit whenever a rule changes.
- No em dashes anywhere. Match the existing code style.
- Design tokens and screens come from the Pencil file; if the pencil MCP is available, use it to read exact values instead of guessing.
