import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

/* Test-only sign-in used by Playwright, since the Google consent screen cannot be automated.
   Disabled unless E2E_TEST_LOGIN=1, and never in production builds. */
export async function POST(request: Request) {
  if (process.env.E2E_TEST_LOGIN !== "1" || process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const parsed = credentials.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "email and password required" }, { status: 400 });
  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ ok: true });
}
