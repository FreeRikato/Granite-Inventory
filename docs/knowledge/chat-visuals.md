---
code:
  - components/chat/visuals/define.ts
  - components/chat/visuals/renderers.tsx
  - components/chat/visuals/answer-streaming.ts
  - components/chat/visuals/use-dealias.ts
  - components/dashboard/moving-bars.tsx
  - components/dashboard/stock-donut.tsx
  - lib/chat/library.tsx
  - lib/chat/library-prompt.ts
  - lib/chat/alias.ts
  - components/chat/no-devtools.ts
  - pnpm-workspace.yaml
  - tests/tooling/chat-library.test.ts
  - tests/tooling/chat-alias.test.ts
---
# Chat visuals

The model answers in OpenUI Lang and the browser draws it with a closed set of components: `Stack`, `Metric`, `RankedBars`, `Donut`, `LineChart`, `BarChart`, `Table` and `Text`. Colours, fonts and sizes are not props, so a reply can only look like the dashboard ([[dashboard]], [[theming]]). The read path that feeds the model is in [[chat]].

## One library, two renderer sets

`buildChatLibrary` in `define.ts` holds every schema and description. It takes the renderers as an argument:

- `lib/chat/library.tsx` passes the real React renderers for the panel's `Renderer`.
- `lib/chat/library-prompt.ts` passes renderers that draw nothing and returns the component part of the system prompt. It imports only `define.ts`, so the route handler can use it without pulling in Recharts or a client boundary.

`define.ts` takes `createLibrary` and `defineComponent` from `@openuidev/lang-core` and only imports types from `@openuidev/react-lang`. The route handler runs in Next's server layer, which loads React's server build without `createContext`, and `@openuidev/react-lang` calls `createContext` when it loads, so a runtime import of it there crashes. Only the browser (`Renderer` in `chat-thread.tsx`) loads react-lang at runtime. `@openuidev/lang-core` is a direct dependency pinned to the version react-lang uses, so the two cannot disagree on the library shape.

Because both libraries come from the same function, the prompt the model reads and the schemas the renderer parses cannot drift. A test compares the two prompts.

## The dashboard draws RankedBars and Donut

`RankedBars` is `RankedBarList` from `components/dashboard/moving-bars.tsx`, the same list `MovingBars` draws, and `Donut` is `DonutRing` and `Legend` from `components/dashboard/stock-donut.tsx`. The chat only maps the model's rows into them (de-aliasing the labels), so a restyle of the dashboard restyles the chat. A test renders both and compares the markup. Rows are keyed by position, because masked labels are all `...` or all "a customer" and two customers can share a name, so a label key would give several rows one key and React would render duplicates; the rows hold no state, so position is a safe key.

A donut slice is keyed `s0`, `s1`, and so on, never by its label. `ChartContainer` writes each key into a `<style>` block as `--color-<key>`, so a label from the model (or from a customer name) used as the key could close the rule and add its own CSS.

The library's `Renderer` accepts renderers of any props, which is why `buildChatLibrary` types its renderers as the library's own `Library["components"][string]["component"]`. What keeps a renderer's props in step with its schema is the `Renderers` type above it.

## Charts wait for the whole answer

While an answer streams, `BarChart` and `LineChart` draw a `Skeleton` with the chart's own `aspect-video w-full` box instead of the chart, so the placeholder and the finished chart are the same size and nothing moves when one replaces the other. The chart mounts once, when the answer settles (the turn is no longer submitted or streaming, so a stream that errors after the chart was written also settles it rather than leaving the placeholder pulsing), and fades in over the fast token (150ms). Drawing it per token would rebuild the Recharts tree many times a second, and a half-received series would draw bars that then change height.

The renderers learn that the answer is streaming from `AnswerStreamingContext` (`answer-streaming.ts`), which `AssistantAnswer` sets from its `settled` flag. It is our own context, not react-lang's `useIsStreaming`, because that hook throws outside a `Renderer` and the tooling test renders single renderers directly; with the default `false` they draw the chart as before. `Donut` and `RankedBars` keep drawing as the rows arrive: their height depends on how many slices or rows the model sends, so no placeholder could have their final size.

`Table` uses `table-fixed`, so column widths are decided by the table and not by the widest cell so far, and a later, longer row does not resize the columns of the rows already shown. Rows appear as the parser delivers them.

## Limits live in the renderers

The OpenUI parser does not enforce array length, so `.max(4)` on a schema would be a promise nothing keeps. The caps are applied where the data is drawn: four series per chart (the `--chart-1..4` colours, in order), five donut slices (`--chart-1..5`) and fifty table rows with a "Showing 50 of N rows" line. The component descriptions tell the model the same limits.

## Aliases become names in the browser

The model only sees `C-xxxxxx` aliases ([[chat]]). Every component that shows text passes it through `useDealias`, which builds one lookup from the cached `customersQuery` ([[browser-reads]]) and swaps `C-` plus six hex characters for the customer name. An alias with no match stays as written, so a customer added since the list was cached still reads as an alias instead of disappearing. A raw code is never painted before that list is known: while `customersQuery` has no data, `maskAliases` shows `...` (three periods) in its place, in text, table cells, chart labels and series names alike, and swaps to the name when the list arrives; if the read fails after its retries, it shows "a customer" instead. `AskProvider` prefetches the list so the placeholder is rarely seen. Numbers are never swapped, only text.

## The dev inspector is off

`@openuidev/react-lang` mounts a floating inspector over the bottom-right corner under `next dev`, which covers the Send button. `components/chat/no-devtools.ts` sets the library's own `Symbol.for("openui.devtools.autoMount")` flag before the library loads, and `chat-thread.tsx` imports it first ([[chat]]).

## No install telemetry

`@openuidev/lang-core` has an install script that reports usage. It is set to `false` in `allowBuilds` in `pnpm-workspace.yaml` so pnpm never runs it. Keep it `false`.
