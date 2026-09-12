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

export type AuthTiming = {
  claimsMs: number;
  memberMs: number;
  settingsMs: number;
};

const getRequestAuthTiming = cache((): AuthTiming => ({ claimsMs: 0, memberMs: 0, settingsMs: 0 }));

export function getAuthTiming(): AuthTiming {
  return getRequestAuthTiming();
}

export function authTimingNow(): number {
  return performance.now();
}

/* Resolves the signed-in Google account to a Team Member. Cached per request so layout and
   pages share one round trip. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const timing = getAuthTiming();
  const claimsStartedAt = authTimingNow();
  const { data } = await supabase.auth.getClaims();
  timing.claimsMs = authTimingNow() - claimsStartedAt;
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) return { status: "anonymous" };

  const memberStartedAt = authTimingNow();
  const { data: row } = await supabase
    .from("team_members")
    .select("email, name, role")
    .eq("email", email)
    .maybeSingle();
  timing.memberMs = authTimingNow() - memberStartedAt;

  if (!row || !isRole(row.role)) return { status: "not-member", email };
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
