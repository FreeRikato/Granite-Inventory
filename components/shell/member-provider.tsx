"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Member } from "@/lib/auth";

const MemberContext = createContext<Member | null>(null);

/* The layout resolves the signed-in Team Member once per document load; pages that render on
   the client read it from here instead of asking the server again. */
export function MemberProvider({ member, children }: { readonly member: Member; readonly children: ReactNode }) {
  return <MemberContext.Provider value={member}>{children}</MemberContext.Provider>;
}

export function useMember(): Member {
  const member = useContext(MemberContext);
  if (!member) throw new Error("useMember must be used inside the app layout");
  return member;
}
