import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NAV_ITEMS } from "@/lib/nav";

type Props = {
  readonly title?: string;
  readonly href?: string;
  readonly children?: ReactNode;
};

export function PageLoading({ href, title, children }: Props) {
  const resolvedTitle = title ?? NAV_ITEMS.find((item) => item.href === href)?.label;

  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      {resolvedTitle ? (
        <div aria-hidden="true" className="text-2xl font-bold tracking-tight md:text-[26px]">
          {resolvedTitle}
        </div>
      ) : null}
      {children ?? (
        <>
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </>
      )}
    </div>
  );
}
