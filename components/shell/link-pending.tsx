"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function LinkPending({ className }: { readonly className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center", className)}>
      {pending ? <Spinner className="size-3.5" /> : null}
    </span>
  );
}
