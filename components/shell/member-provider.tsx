"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Member } from "@/lib/auth";
import { canWrite } from "@/lib/domain";

const MemberContext = createContext<Member | null>(null);

export function MemberProvider({ member, children }: { readonly member: Member; readonly children: ReactNode }) {
  return <MemberContext.Provider value={member}>{children}</MemberContext.Provider>;
}

export function useMember(): Member {
  const member = useContext(MemberContext);
  if (!member) throw new Error("useMember must be used inside the app layout");
  return member;
}

export function useCanWrite(): boolean {
  return canWrite(useMember().role);
}
