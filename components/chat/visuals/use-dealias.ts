"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createDealiaser } from "@/lib/chat/alias";
import { customersQuery } from "@/lib/query/reads";

export function useDealias() {
  const { data } = useQuery(customersQuery);
  return useMemo(() => createDealiaser(data ?? []), [data]);
}
