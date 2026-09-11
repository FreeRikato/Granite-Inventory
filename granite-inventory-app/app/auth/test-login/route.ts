import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Test-only sign-in used by Playwright, since the Google consent screen cannot be automated.
   Disabled unless E2E_TEST_LOGIN=1, and never in production builds. */
export async function POST(request: Request) {
  if (process.env.E2E_TEST_LOGIN !== "1" || process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const body: unknown = await request.json();
  if (
    typeof body !== "object" || body === null ||
    typeof (body as { email?: unknown }).email !== "string" ||
    typeof (body as { password?: unknown }).password !== "string"
  ) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  const { email, password } = body as { email: string; password: string };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ ok: true });
}
