---
code:
  - supabase/migrations/20261029180000_chat_query.sql
  - tests/seam/chat-query.test.ts
  - app/api/chat/route.ts
  - lib/chat/answer.ts
  - lib/chat/tools.ts
  - lib/chat/alias.ts
  - lib/chat/system-prompt.ts
  - lib/chat/model.ts
  - lib/chat/test-model.ts
  - tests/seam/chat-answer.test.ts
  - tests/eval/chat.eval.ts
  - vitest.config.ts
  - components/chat/ask-provider.tsx
  - components/chat/ask-button.tsx
  - components/chat/ask-panel.tsx
  - components/chat/chat-thread.tsx
  - components/chat/chat-history.ts
  - components/chat/chat-error.ts
  - components/chat/chat-answer.ts
  - components/chat/visuals/renderers.tsx
  - components/chat/request-messages.ts
  - tests/tooling/chat-thread.test.ts
  - tests/tooling/chat-library.test.ts
  - components/chat/no-devtools.ts
  - lib/use-online.ts
  - tests/e2e/chat.spec.ts
---
# Chat

The Overview chat ([[dashboard]]) lets a model answer questions by writing SQL. Everything it may read is decided in Postgres; see [ADR 0004](../adr/0004-chat-reads-through-a-read-only-role.md) for why.

## The read path

`chat_query(q text) returns jsonb` is called through PostgREST with the member's session ([[auth-session]]). It is `security definer` and owned by `chat_reader`, so everything inside it runs as `chat_reader`. In one transaction it:

1. refuses a caller who is not a team member (`42501`, "Chat is for team members"), before the query is read,
2. sets `transaction_read_only = on`,
3. in a sub-transaction, empties `request.headers` and `request.cookies`, cuts `request.jwt.claims` down to the email, and runs `select * from (<q>) limit 500`, collecting the rows as a JSON array,
4. rolls the sub-transaction back, keeps the rows, and releases every session-level advisory lock the query took (also when the query fails or is cancelled by the statement timeout).

Errors (permission, syntax, read-only) come back as the RPC error, so the model can read the message and try again. The statement timeout is the one `authenticated` already has; a query that sets `statement_timeout` to 0 does not lift it, because the timer for the call is already running.

Only `authenticated` may execute it. A signed-in stranger is refused by step 1, so every view can end in `where (select is_member())` ([[access-model]]) without that filter being the only guard, and every view is `security_barrier` so a query condition cannot be evaluated against rows the member filter would have hidden.

## What the query can do with the session

The query runs as `chat_reader`, which only has what `public` has: it can call every function that is executable by `public` and set any custom setting (`set_config` is a function). Postgres cannot take a `public` privilege away from one role, so the guard is the shape of `chat_query`, not a list of forbidden functions:

- Identity. `is_member()` reads `request.jwt.claims` through `auth.jwt()`, and a query can overwrite that setting with `set_config('request.jwt.claims', ...)`. The membership check runs once, before the query, so a forged email buys a stranger nothing: they are refused first. The same query used to be able to set `request.jwt.claim` (singular, which `auth.jwt()` reads first) at session level and keep it on the pooled connection, turning later requests of other users into admins; the sub-transaction rollback undoes every session-level `set_config(..., false)`.
- Secrets in the request. PostgREST puts the whole request in `request.headers`, bearer token included. Step 3 empties it and the cookies, and leaves the model only the member's email from the claims (no `sub`, `session_id` or Google profile).
- State that outlives the call. A session-level advisory lock (`pg_advisory_lock`, `pg_try_advisory_lock`, shared variants) is not undone by a rollback or by the transaction ending, and would sit on the pooled connection holding off whoever asks for that key; Add Batch takes `pg_advisory_xact_lock(hashtext(prefix))`. `pg_advisory_unlock_all()` after the query, and in both error branches, releases them. `pg_notify` (for example `pgrst`, which makes PostgREST reload) is discarded with the sub-transaction.
- Time. `pg_sleep` and heavy joins stop at the statement timeout.

`plpgsql` keeps its local variables when a sub-transaction is rolled back, which is how the rows survive the rollback. The branch for `query_canceled` is separate because `when others` does not match it.

What this does not close: the query can still read anything `public` can read. Catalogs and function sources hold no data. Database-level settings are readable too: the local Supabase stack sets `app.settings.jwt_secret` on the database, readable with `current_setting('app.settings.jwt_secret', true)` and from `pg_db_role_setting`. Check hosted projects with `select setconfig from pg_db_role_setting where setdatabase <> 0`; a signing secret there is readable by any team member through chat.

## Why the role cannot be changed

An earlier version switched with `set local role chat_reader` in a normal function. `set role` is allowed to any role the connection's login (`authenticator`) belongs to, which includes `authenticated` and `service_role`, so `select set_config('role', 'authenticated', true), query_to_xml('select name from customers', ...)` read customer names inside one statement. Scanning the query or its plan for `set_config` does not help, because `query_to_xml(concat('select set_', 'config(...)'))` builds the name at run time.

The fix is in the privilege model, not the text. Postgres refuses to change `role` or `session_authorization` inside a security-definer function, however deeply nested, and refuses to leave a read-only transaction once a query has run. `chat_query` is owned by `chat_reader` and is `security definer`, so the member's query starts as `chat_reader` and cannot become anything else. `chat_reader` gets `create` on `public` only for the `alter function ... owner to` in the migration and loses it in the same migration; `postgres` loses its `set` option on `chat_reader` right after, since nothing needs it later. `chat-query.test.ts` runs eight spellings, including the run-time-built ones, as an operator with a real customer and checks that neither the error nor the response holds the name or phone.

## What the views hide

- No `created_by`, `updated_by` or `notes` anywhere: those hold team member emails and free text.
- Customers appear only as `customer_alias`: `C-` plus the first six characters of the customer id. The model never sees a name or phone.
- No `settings`, `team_members`, raw tables or `v_sales`: `chat_reader` simply has no grant on them.

`authenticated` has no privilege on the chat views and is not a member of `chat_reader`, so a direct `select` on a `v_chat_*` view through the API is refused too.

## Why the views restate their sources

Table privileges inside an owner-rights view use the view owner, but a nested `security_invoker` view and every function call use the caller, here `chat_reader`, which is why it also has `usage` on `private` and `execute` on `is_member()`. So `v_chat_batches`, `v_chat_sales`, `v_chat_stock_lines` and `v_chat_kpis` repeat the logic of `v_yard_batches`, `v_sales`, `v_stock_lines` and `v_dashboard_kpis` over the tables, and the ageing band is inlined because `ageing_band()` reads `settings`. The "mirror" tests in `chat-query.test.ts` compare every shared column with the original view on a dataset that has an old batch, a stickered sale and an archived batch. When a derived figure changes in one place, that test fails until the other follows.

## The answer route

`POST /api/chat` does three things and nothing else: `getSession()` must say the caller is a member (401 otherwise, a signed-out visitor and a signed-in stranger look the same; for a signed-out visitor the proxy answers first with the same 401 body, see [[auth-session]]), a model must exist (503 "Chat is not set up yet" when `OPENROUTER_API_KEY` is empty), and the body must be valid UI messages (400). Then `answerChat` in `lib/chat/answer.ts` builds the stream. The route is the only place that knows about cookies, so the answer function takes the member's Supabase client and a model as arguments and tests call it with a real signed-in client and a mock model.

`answerChat` runs `streamText` with two tools and at most 5 steps. `maxRetries` is 0: the SDK's own retry would repeat the same model, and a 429 means a daily cap, so retrying only delays the message. A 429 from the provider becomes "Daily limit reached, try again after 5:30 AM" (the free fallback model's cap, 50 requests a day across the whole OpenRouter account, resets at midnight UTC, which is 5:30 in India); the paid primary model has no daily cap, so the message names a cap only the free fallback has. Any other provider error becomes "Something went wrong, please try again", so a raw provider message never reaches the panel. When a stream finishes, `answerChat` writes one `console.info` line, `{"event":"chat_answer","modelId":...,"steps":N}`, because the stream never says which model answered. The model id comes from the response metadata, so the fallback shows as itself; the line carries no prompt, rows or names.

One retry on the fallback: OpenRouter's `models` list only falls back before a response starts, and live a 503 "overloaded" and a 504 "timed out" from the primary arrived as errors after it had started, so the member saw "Something went wrong" and the fallback never ran. `retryOnceOn` wraps the primary model. When a model step fails before it wrote any answer (a thrown error, or an error as the first real chunk of the stream), it runs the same step, with the same prompt and tools, on the fallback model named explicitly (`chatFallbackModel`), once per turn. A failure after the first token is not retried, because the member could already be reading it. A 429 is not retried either: the free fallback shares the account's cap, so a second call would only spend a request to get the same message. A failure of the retry itself becomes the plain error line.

The browser re-sends the whole thread every turn, including each earlier `run_query` call with up to 500 rows, so the history is pruned before it reaches the model: `pruneMessages` drops the `run_query` calls and results of every earlier turn and keeps the questions, the answers and the `find_customer` lookups. A follow-up that needs the figures again runs the query again; the answer text already carries the numbers the member saw.

### Why the answer step is forced

Live, the free model answered plain text and tables but a chart question never rendered one. It ran the five steps and ended with nothing, or with a raw `<tool_call>` block written as text. In the raw stream the model had the rows by step 2, wrote in its reasoning "now I have all the data, let me create the BarChart", and then still called `run_query` again (a totals query, or a list of product names), over and over. Two things fed that: the chart components draw at most 4 series and the demo has 5 products, so it went looking for "the top 4"; and nothing told it to stop querying. With the final step set to `toolChoice: "none"` alone it still wrote a tool call as text.

So `answerChat` does three things. `prepareStep` turns tools off and appends an order to write the answer (first line `root = Stack(`, no tool call) on the last allowed step and on the step after two `run_query` calls that returned rows; a failed query or an empty result does not count, so a member's question that needs a retry still gets its retries. When no query returned any rows (every one failed or came back empty) the order is a different one: it says no figures exist, that the one Text must say the data could not be fetched or that there is none, and that no number may be stated or guessed. The first wording, "using only the rows already returned", with no rows pushed a free model to invent figures. The system prompt says to answer as soon as the rows are back, to prefer a chart whenever two or more values are compared, to put the dimension with more than 4 values in the labels and the one with 4 or fewer in the series, to put 0 for a missing month, to end the SELECT without a semicolon (the query is wrapped in another, so a trailing one is a syntax error that cost a step), and how to bucket sales by month in India time, with `CHART_EXAMPLE`, a worked answer that `tests/tooling/chat-library.test.ts` parses with the real parser. What the panel does when the model still does not write an answer is under The Ask panel below.

### Request size

The panel sends the thread without the `run_query` parts of earlier turns (`withoutEarlierQueryRows` in `request-messages.ts`, wired through the transport's `prepareSendMessagesRequest`), because the server drops them anyway and each held up to 500 rows. The route reads the body as text and answers 413 `{"error": "This chat is too long. Start a new chat."}` above 256 KB; the panel shows that text like any other `{"error"}` body.

## Names never reach the model

Before every request, `aliasCustomerNames` swaps each customer name found in a message for its alias, over the whole history because the browser re-sends it. Names come from the member's own read of `customers` (RLS applies), longest first so "Sri Balaji Granites" is not split by a customer called "Sri Balaji", case-insensitive, any run of whitespace in a stored name matches any run the member types, and only on whole words so "Sri Balajis" is left alone. It is one pass over the text with a single pattern, and an alias already in the text (the model's earlier answers carry them) is matched first and kept, so a customer called "C" cannot turn `C-3f9a2b` into `C-cccccc-3f9a2b`. `alias.ts` stays free of the Supabase client so its tooling test runs with no env file; the customer read lives in `answer.ts`. Only names are swapped: a phone number a member types themselves is sent as typed.

`find_customer` searches by name on the server and returns aliases and types, so the model can turn "Balaji" the member typed into the alias it filters on. `%` and `_` in the search are escaped; otherwise "%" would list every customer.

`run_query` returns the rows from `chat_query`, or "Query failed: <message>" so the model can read what went wrong (a write, an unknown column, a table it may not read) and try again.

## The system prompt is built from the database

`loadChatViews` asks `chat_query` for the columns of every `v_chat_*` view, so the prompt can never list a column the view lacks or miss a view added later. It runs as the member and `chat_reader` sees these views, so it works through the same read path as the model's queries. The component half of the prompt comes from `componentPrompt()` ([[chat-visuals]]). Two rules in it exist because the live model got them wrong. Stale and Ageing are the `ageing_band` values `'STALE'`, `'AGEING'` and `'FRESH'` of `v_chat_batches`, set by the app's own settings, and the model must filter on that column: asked for the supplier with the most stale batches it once cut at 90 days, counted ageing batches as stale and named the wrong supplier. And `Text` is plain text, because the panel shows it as typed and a `**2 batches**` would reach the member with its asterisks. The date is today in India ([[ist-calendar]]); the server runs in UTC, which is a day behind between midnight and 5:30 IST.

## Which model answers

`lib/chat/model.ts` picks one:

- With `E2E_TEST_LOGIN=1` outside production (the guard `app/auth/test-login/route.ts` uses), a canned mock model in `lib/chat/test-model.ts`. It calls `run_query` once for a customer alias, then replies with a fixed bar chart and a sentence naming that alias. It needs no key, so Playwright and local runs work offline and use none of the daily requests.
- Otherwise OpenRouter with `OPENROUTER_API_KEY`: `deepseek/deepseek-v4.1-flash-1017` (paid, tool calling supported) first, `google/gemma-4-31b-it:free` as OpenRouter's fallback in the same request, and again as the explicit one retry after a failure before any answer text (`chatFallbackModel`; the canned model has none). No privacy routing is set, so a host may log prompts, which hold costs and margins but never names.
- With neither, no model, and the route answers 503.

The default `pnpm test` never sets a key and never reaches openrouter.ai.

## The live eval

`pnpm eval:chat` sends 10 questions over a small seeded yard (4 batches, 2 suppliers, 2 customers, 4 sales) through `answerChat` with the real OpenRouter model, the same function and model the route uses, and prints how many answers carried the right number. The questions cover a count, a stock sum, revenue and margin in rupees, a group-by, a rolling 7-day window and "today" (both in IST), a customer named in the question (which exercises aliasing), a stale-batch count, and a phone number the data does not hold, where the check is that the reply invents no 10-digit number.

A number is right when it appears as a value in a `run_query` result or in the reply text, so the check is deterministic and does not read the OpenUI Lang. The seed is chosen so each expected number is unique among the others; a small number such as 1 can still match by chance, which makes a pass slightly generous and a fail always real.

It runs only with `CHAT_EVAL=1`, which `pnpm eval:chat` sets and which swaps the Vitest include from the seam and tooling tests to `tests/eval`. Without `OPENROUTER_API_KEY` it fails at load with "OPENROUTER_API_KEY is not set" before touching the database. It clears `E2E_TEST_LOGIN` so the canned model can never stand in for the live one.

A question costs about 3 requests (a lookup, a query and the answer), so a full run is about 30 requests on the paid primary model, which draw on the account's credit. A fallback to the free model does not draw on it, but it is capped at 50 requests a day. Run it when the prompt, the views or the model list change, not on every commit. The pass count is printed under the primary model's name; a run that falls back to the second model through OpenRouter's `models` list is counted under the primary.

## The Ask panel

Overview wraps its header, content and panel in `AskProvider`, which holds one `open` flag. `AskButton` in the `PageHeader` actions toggles it; `AskPanel` renders nothing while closed. Open, it is a fixed 380px column on the right at 1280px (`xl`) and wider, and a full-screen sheet below that. Docking from 1024px left the dashboard column 308px wide with the KPI cards overlapping and the Ask button half covered, so the switch is at `xl` (z-index 45, above the mobile tab bar at 40 and below the offline bar at 50). The panel carries `data-ask-open`, and the app layout's `main` pads its right side by 380px plus a gutter through `xl:has-[[data-ask-open]]:pr-...`, so the dashboard column narrows instead of sitting under the panel. The layout stays a server component and needs no state for this.

The panel is unmounted when closed, so the input is focused each time it opens. Closing mid-answer drops the unfinished reply; the question is not saved until the answer settles.

`ChatThread` loads the saved thread, then mounts `ChatSession`, which runs `useChat` against `/api/chat`. Member messages show as typed. `answerSource` (`chat-answer.ts`) picks what goes to `Renderer`: the last text part that holds an OpenUI answer, because the model may write a sentence before a tool call, a junk reply on the forced step must not hide a valid chart from an earlier step, and raw `<tool_call>` text must never be shown. A part holds an answer when a line starts with `root =`: a single fenced block (with any or no language tag) is unwrapped first, and any prose before the `root =` line is dropped, because models often wrap the answer in a code fence with a sentence before it. A fence holding junk has no such line, so it falls to the table or the fallback line. When a settled turn has no such part but a `run_query` returned rows, the panel builds an answer itself: a Text "Here is the data I found." and a Table of the last query that returned rows (columns in first-seen order, `null` as empty, other non-text values as JSON), so the member still gets the data; `Table` shows 50 rows and de-aliases like any other. A turn that is still streaming, or ended in an error, gets no such table. With no model answer and no rows, the panel shows "I could not finish that answer. Try asking a narrower question." (`endedWithoutAnswer`); a turn that errored shows its error instead.

In the 380px panel a grouped `BarChart` showed 3 of 5 product names, because Recharts hides x-axis ticks that would overlap. The chat charts set `interval={0}` and draw each label on its own wrapped lines (a word is cut at 9 characters with an ellipsis), so every bar is named; `tests/e2e/chat.spec.ts` counts the five labels in the panel. Aliases become names inside the components ([[chat-visuals]]).

History is saved per member under `granite-chat:<email>` in IndexedDB (idb-keyval) once the status is `ready`, so a streaming answer is not written on every chunk. A new chat empties the thread and the effect deletes the key. A saved thread is checked with `safeValidateUIMessages` when loaded; anything that does not pass is treated as empty rather than crashing the panel. The key holds the model's text with aliases, never names.

Failures come back two ways. A 401, 503 or 400 is an HTTP error whose body is `{"error": "..."}`, and `chatErrorText` shows that text. A provider failure such as the daily limit travels inside the stream, where the text is already the plain message `answerChat` chose. Either way it shows as one plain line in the thread.

The input is disabled while `useOnline` says the browser is offline, with "You are offline, chat needs a connection" under it ([[browser-reads]]).

## The route runs in Next's server layer

Route handlers load React's server build, which has no `createContext`, and `@openuidev/react-lang` calls it when it loads. So `components/chat/visuals/define.ts` takes `createLibrary` and `defineComponent` from `@openuidev/lang-core` (a direct dependency, pinned to the version react-lang uses) and only imports react-lang's types. A Vitest import cannot show this, because Vitest loads the normal React build; the Playwright flow does, through a real `POST /api/chat`.

## The inspector widget

Under `next dev`, `@openuidev/react-lang` mounts a floating inspector over the bottom-right corner, which covers the Send button. `no-devtools.ts` sets the library's own `Symbol.for("openui.devtools.autoMount")` flag before the library loads; `chat-thread.tsx` imports it first. Keep it first.

Related: [[sales-and-stock-lines]], [[batches]], [[chat-visuals]], [[ist-calendar]].
