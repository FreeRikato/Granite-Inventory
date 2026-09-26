---
code:
  - .oxlintrc.json
  - .oxfmtrc.json
  - scripts/comments.ts
  - .githooks/pre-commit
  - package.json
  - tsconfig.json
---
# Tooling

```
pnpm lint            oxlint
pnpm format          oxfmt, writes in place
pnpm format:check    oxfmt --check
pnpm comments        the comment check over the whole tree
pnpm typecheck       tsc
```

## oxlint

oxlint replaced ESLint. It runs the correctness category with the typescript, react, nextjs, jsx-a11y, unicorn, oxc and import plugins. The `suspicious` category is off because it flagged fresh-array `.sort()` calls and React's `__reactFiber` probe in a test, which is noise here.

Rules switched off, and why:

- `react/react-in-jsx-scope`: React's automatic JSX runtime needs no `React` import.
- `jsx-a11y/prefer-tag-over-role`: the radio groups and the combobox are deliberate ARIA widgets built on buttons. The axe specs cover their accessibility.
- `jsx-a11y/no-autofocus`: dialogs focus their first field on purpose.
- In `components/ui/**` (vendored shadcn): the two click-handler rules, since an input group addon focuses its input when clicked.
- In `components/search-select.tsx`: `role-has-required-aria-props`, a false positive because Radix adds `aria-controls` at runtime ([[search-select]]).

## oxfmt

It uses the default style (double quotes, semicolons, trailing commas) with a 120-column print width, close to what the code already used. `docs/`, the generated `lib/database.types.ts` and the agent folders are not formatted.

## The comment check

`scripts/comments.ts` finds comments with a real parser for TS and JS (`oxc-parser`), so `"http://"` in a string or `/\/\//` in a regex never counts. SQL, CSS and shell use small quote-aware scanners: SQL handles nested block comments and scans inside function bodies, and shell skips the shebang, heredoc bodies and `${#var}`. It runs under Node's native type stripping; the `MODULE_TYPELESS_PACKAGE_JSON` warning is silenced because `package.json` has no `"type"` field. The rule itself is in the [README](README.md).

The tsconfig and the linter both exclude `.claude`, `.agents` and `.scratch`: agent skills and run output share the repo root with the app but are not app code.

Related: [[testing]], [[worktrees]].
