---
code:
  - components/chat/visuals/define.ts
  - components/chat/visuals/renderers.tsx
  - components/chat/visuals/use-dealias.ts
  - components/dashboard/moving-bars.tsx
  - components/dashboard/stock-donut.tsx
  - lib/chat/library.tsx
  - lib/chat/library-prompt.ts
  - lib/chat/alias.ts
  - pnpm-workspace.yaml
  - tests/tooling/chat-library.test.ts
  - tests/tooling/chat-alias.test.ts
---
# Chat visuals

The model answers in OpenUI Lang and the browser draws it with a closed set of components: `Stack`, `Metric`, `RankedBars`, `Donut`, `LineChart`, `BarChart`, `Table` and `Text`. Colours, fonts and sizes are not props, so a reply can only look like the dashboard ([[dashboard]], [[theming]]). The read path that feeds the model is in [[chat]].

## One library, two renderer sets

`buildChatLibrary` in `define.ts` holds every schema and description. It takes the renderers as an argument:

- `lib/chat/library.tsx` passes the real React renderers for the panel's `Renderer`.
- `lib/chat/library-prompt.ts` passes renderers that draw nothing and returns the component part of the system prompt. It imports only `define.ts`, so the route handler can use it without pulling in Recharts or a client boundary. `@openuidev/react-lang` itself has no `"use client"`, so it loads in Node.

Because both libraries come from the same function, the prompt the model reads and the schemas the renderer parses cannot drift. A test compares the two prompts.

## The dashboard draws RankedBars and Donut

`RankedBars` is `RankedBarList` from `components/dashboard/moving-bars.tsx`, the same list `MovingBars` draws, and `Donut` is `DonutRing` and `Legend` from `components/dashboard/stock-donut.tsx`. The chat only maps the model's rows into them (de-aliasing the labels), so a restyle of the dashboard restyles the chat. A test renders both and compares the markup.

A donut slice is keyed `s0`, `s1`, and so on, never by its label. `ChartContainer` writes each key into a `<style>` block as `--color-<key>`, so a label from the model (or from a customer name) used as the key could close the rule and add its own CSS.

The library's `Renderer` accepts renderers of any props, which is why `buildChatLibrary` types its renderers as the library's own `Library["components"][string]["component"]`. What keeps a renderer's props in step with its schema is the `Renderers` type above it.

## Limits live in the renderers

The OpenUI parser does not enforce array length, so `.max(4)` on a schema would be a promise nothing keeps. The caps are applied where the data is drawn: four series per chart (the `--chart-1..4` colours, in order), five donut slices (`--chart-1..5`) and fifty table rows with a "Showing 50 of N rows" line. The component descriptions tell the model the same limits.

## Aliases become names in the browser

The model only sees `C-xxxxxx` aliases ([[chat]]). Every component that shows text passes it through `useDealias`, which builds one lookup from the cached `customersQuery` ([[browser-reads]]) and swaps `C-` plus six hex characters for the customer name. An alias with no match stays as written, so a customer added since the list was cached still reads as an alias instead of disappearing. Numbers are never swapped, only text.

## No install telemetry

`@openuidev/lang-core` has an install script that reports usage. It is set to `false` in `allowBuilds` in `pnpm-workspace.yaml` so pnpm never runs it. Keep it `false`.
