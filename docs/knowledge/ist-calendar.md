---
code:
  - supabase/migrations/20260911093608_team_and_settings.sql
  - supabase/migrations/20260911140000_dashboard.sql
  - supabase/migrations/20260912180000_db_api_hardening.sql
  - tests/seam/fixtures.ts
  - tests/seam/yard.test.ts
  - tests/seam/batches.test.ts
  - tests/e2e/seed.ts
---
# IST calendar

Every date rule in the yard is "today in India", whatever zone the server runs in. `private.ist_today()` returns `(now() at time zone 'Asia/Kolkata')::date` and everything else builds on it: Age, Ageing Band, the future-date refusal on purchases and sales, and "this month" on the [[dashboard]], which is the calendar month in India.

Dates are bounded below as well: nothing before 2000 is accepted, which keeps the two-digit year in a Batch Code unambiguous for the whole supported history (see [[batches]]). The upper bound is the IST business date.

## Why tests care

Postgres and the test runner both run in UTC, which is a day behind India between 18:30 and midnight UTC (midnight to 05:30 IST). Dates built from the UTC clock, or from `current_date` in SQL, are then a day early, which silently adds a day to every asserted age and makes "tomorrow" look like today.

So every fixture speaks IST:

- `tests/seam/fixtures.ts` has `today()` and `daysAgo(n)` built from a fixed +05:30 offset. India has no DST, so a fixed offset is exact. Use them instead of `new Date()`; a negative `daysAgo` gives a future date.
- `tests/e2e/seed.ts` builds its small yard (two Black Pearl 4x2 batches, one stale and one fresh, one 5x3 batch and one Doom Stone batch) with every date as an offset from `private.ist_today()`.
- Both the JS helpers and any SQL fixture must anchor to IST. Two batch tests broke nightly until they switched to `today()`.

Related: [[testing]], [[yard]].
