"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SETTINGS_ITEM, isActivePath, roleLabel } from "@/lib/nav";
import type { Member } from "@/lib/auth";

type Props = { readonly businessName: string; readonly member: Member };

export function AppSidebar({ businessName, member }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6 md:flex">
      <div className="flex items-center justify-between px-1">
        <span className="text-base font-bold">{businessName}</span>
        <Link
          href="/catalog"
          target="_blank"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Open public catalog"
        >
          <ExternalLink className="size-4" />
        </Link>
      </div>

      <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.shell ? true : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-primary/30"
                  : "text-sidebar-foreground hover:bg-secondary",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-sidebar-border pt-4">
        <Link
          href={SETTINGS_ITEM.href}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 hover:bg-secondary",
            isActivePath(pathname, SETTINGS_ITEM.href) && "bg-sidebar-accent",
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {member.name.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{member.name}</span>
            <span className="text-xs text-muted-foreground">{roleLabel(member.role)}</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}
