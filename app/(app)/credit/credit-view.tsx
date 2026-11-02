"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { useMember } from "@/components/shell/member-provider";
import { ViewError, ViewReady } from "@/components/view-state";
import { useHydrated } from "@/lib/query/provider";
import { creditQuery } from "@/lib/query/reads";
import { CreditList } from "./credit-list";

export function CreditView({ skeleton }: { readonly skeleton: ReactNode }) {
  const hydrated = useHydrated();
  const credit = useQuery(creditQuery);
  const member = useMember();

  if (!hydrated || !credit.isSuccess) {
    if (credit.isError) return <ViewError what="credit" message={credit.error.message} />;
    return skeleton;
  }

  return (
    <ViewReady>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={credit.dataUpdatedAt} fetching={credit.isFetching} />
      </div>
      <CreditList rows={credit.data} isAdmin={member.role === "ADMIN"} />
    </ViewReady>
  );
}
