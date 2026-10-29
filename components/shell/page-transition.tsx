"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const byDirection = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" };

export function PageTransition({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ViewTransition key={pathname} enter={byDirection} exit={byDirection} default="none">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-7">{children}</div>
    </ViewTransition>
  );
}

export function backTypes(pathname: string, href: string): string[] | undefined {
  return href !== "/" && pathname.startsWith(`${href}/`) ? ["nav-back"] : undefined;
}
