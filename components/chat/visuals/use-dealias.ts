"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createDealiaser, maskAliases } from "@/lib/chat/alias";
import { customersQuery } from "@/lib/query/reads";

const PENDING_ALIAS = "...";
const FAILED_ALIAS = "a customer";

export function useDealias() {
  const { data, isError } = useQuery(customersQuery);
  return useMemo(() => {
    if (data) return createDealiaser(data);
    const replacement = isError ? FAILED_ALIAS : PENDING_ALIAS;
    return (text: string) => maskAliases(text, replacement);
  }, [data, isError]);
}
