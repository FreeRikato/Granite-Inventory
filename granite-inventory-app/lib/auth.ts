import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "ADMIN" | "YARD_OPERATOR";

export type Member = {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
};

export type Session =
  | { readonly status: "anonymous" }
  | { readonly status: "not-member"; readonly email: string }
  | { readonly status: "member"; readonly member: Member };

function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "YARD_OPERATOR";
}

/* Resolves the signed-in Google account to a Team Member. Cached per request so layout and
   pages share one round trip. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) return { status: "anonymous" };

  const { data: row } = await supabase
    .from("team_members")
    .select("email, name, role")
    .eq("email", email)
    .maybeSingle();

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
