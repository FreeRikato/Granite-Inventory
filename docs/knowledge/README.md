# Knowledge graph

Code in this repo carries no comments. Everything a comment would say (why a rule exists, what a non-obvious piece of code guards against, what a test proves) lives here as a linked note instead, so it can be read on its own, linked from other notes and kept current in one place.

## The rule

- No comments in TypeScript, JavaScript, SQL, CSS or shell files. Shebangs are fine. Config formats (JSON, TOML, YAML) and Markdown are not checked.
- `.githooks/pre-commit` runs `scripts/comments.ts --staged` and refuses a commit whose staged files contain a comment. `pnpm comments` checks the whole tree. `pnpm install` points git at `.githooks` through the `prepare` script.
- Generated and vendored paths are skipped: `lib/database.types.ts`, `.claude/`, `.agents/`, `.codex/`. A newly added shadcn component may arrive with comments; delete them.
- When code needs an explanation, write or update the note for its concept and list the file under `code:`. If a note goes stale because the code changed, fix the note in the same commit.

## Writing a note

- One concept per note, named in kebab case. Frontmatter lists the files it explains under `code:`.
- Link related notes with `[[note-name]]`. Link liberally; a link to a note that does not exist yet marks something worth writing.
- Business terms come from [CONTEXT.md](../../CONTEXT.md). Settled decisions live in [docs/adr](../adr/) and are linked, not restated.

## Notes

Data and rules (Postgres)
- [[ist-calendar]]: every date rule is "today in India"
- [[access-model]]: Team Members, RLS, security definer functions, the last Admin
- [[batches]]: Batch Code, slot suggestion, size rule, Variants on the fly
- [[sales-and-stock-lines]]: record_sale, phone identity, Stock Lines, margin
- [[corrections]]: Admin edits and deletes that keep Available consistent
- [[readable-refusals]]: every refusal reads as a business rule, never raw Postgres
- [[public-catalog]]: what anonymous visitors can read
- [[dashboard]]: derived figures and the two charts

App
- [[browser-reads]]: static shells, browser cache, IndexedDB, invalidation after writes
- [[focus-after-write]]: where focus goes when a dialog closes after a write
- [[auth-session]]: proxy, server client, member lookup, public env vars
- [[yard]]: derived yard view, ordering, filters in the URL
- [[forms-and-components]]: shared form pieces, Sell and Inward details, the palette
- [[search-select]]: the one matching rule and inline create
- [[theming]]: dark mode and the per-device tint

Working on the repo
- [[testing]]: seam and e2e suites, the test login, hydration guards, what each odd spec proves
- [[worktrees]]: scripts/wt, ports and the shared-DB lock
- [[tooling]]: oxlint, oxfmt and the comment check
