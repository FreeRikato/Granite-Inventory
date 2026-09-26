"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MOBILE_MORE, MOBILE_TABS, isActivePath } from "@/lib/nav";

export function MobileTabBar() {
  const pathname = usePathname();
  const moreActive = MOBILE_MORE.some((item) => isActivePath(pathname, item.href));
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      {MOBILE_TABS.map((item) => (
        <TabLink
          key={item.href}
          href={item.href}
          label={item.shortLabel}
          active={isActivePath(pathname, item.href)}
        >
          <item.icon className="size-5" />
        </TabLink>
      ))}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
            moreActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="size-5" />
          More
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="sr-only">More</SheetTitle>
          <div className="mt-4 flex flex-col gap-1">
            {MOBILE_MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.shell ? true : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                  isActivePath(pathname, item.href) ? "bg-accent text-accent-foreground" : "",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function TabLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
      {label}
    </Link>
  );
}
