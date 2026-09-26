---
code:
  - proxy.ts
  - lib/supabase/proxy.ts
  - lib/supabase/server.ts
  - lib/auth.ts
  - lib/env.ts
  - app/(app)/layout.tsx
  - app/auth/test-login/route.ts
---
# Auth and session

- The proxy calls `getClaims()`, which validates the JWT and refreshes it when needed. Nothing may run between creating the Supabase client and that call.
- The server client's cookie `setAll` is a no-op when called from a Server Component; the proxy is what refreshes sessions.
- `lib/auth.ts` resolves the signed-in Google account to a Team Member, cached per request so the layout and the pages share one round trip ([[access-model]]).
- `NEXT_PUBLIC_` values must be referenced literally so Next can inline them into the browser bundle; `lib/env.ts` does that once.
- `app/auth/test-login` is a test-only sign-in for Playwright, since the Google consent screen cannot be automated. It is disabled unless `E2E_TEST_LOGIN=1`, and never in production builds ([[testing]]).

Related: [[browser-reads]].
