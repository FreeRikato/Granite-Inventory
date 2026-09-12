import { cache } from "react";
import { isRole, type Role } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
};

export type Session =
  | { readonly status: "anonymous" }
  | { readonly status: "not-member"; readonly email: string }
  | { readonly status: "member"; readonly member: Member };

type AuthTiming = {
  claimsMs: number;
  memberMs: number | null;
};

const AUTH_TIMING_ENABLED = process.env.AUTH_TIMING === "1";

function getAuthTiming(): AuthTiming | null {
  return AUTH_TIMING_ENABLED ? { claimsMs: 0, memberMs: null } : null;
}

function logAuthTiming(timing: AuthTiming | null): void {
  if (!timing) return;
  console.log(`auth-timing ${JSON.stringify(timing)}`);
}

/* Resolves the signed-in Google account to a Team Member. Cached per request so layout and
   pages share one round trip. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const timing = getAuthTiming();
  const claimsStartedAt = timing ? performance.now() : 0;
  const { data } = await supabase.auth.getClaims();
  if (timing) timing.claimsMs = performance.now() - claimsStartedAt;
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) {
    logAuthTiming(timing);
    return { status: "anonymous" };
  }

  const memberStartedAt = timing ? performance.now() : 0;
  const { data: row } = await supabase
    .from("team_members")
    .select("email, name, role")
    .eq("email", email)
    .maybeSingle();
  if (timing) timing.memberMs = performance.now() - memberStartedAt;

  if (!row || !isRole(row.role)) {
    logAuthTiming(timing);
    return { status: "not-member", email };
  }
  logAuthTiming(timing);
  return {
    status: "member",
    member: { email: row.email, name: row.name ?? row.email, role: row.role },
  };
});

export async function requireMember(): Promise<Member> {
  const session = await getSession();
  if (session.status !== "member") throw new Error("Not a team member");
  return session.member;
}
