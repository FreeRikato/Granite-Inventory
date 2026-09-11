"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_ITEMS, SETTINGS_ITEM } from "@/lib/nav";
import { formatSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type Line = Pick<Tables<"v_stock_lines">, "line_key" | "product_name" | "variant_name" | "variant_id" | "length_ft" | "breadth_ft" | "thickness_mm" | "available" | "category">;
type Customer = Pick<Tables<"customers">, "id" | "name" | "phone">;

/* Search or jump to: pages, Stock Lines (opens the yard filtered to the line) and Customers.
   Data loads on first open through the browser client, so RLS applies as usual. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);

  /* Loaded on first open; the data is small and RLS applies through the browser client. */
  const openPalette = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next || lines !== null) return;
      const supabase = createClient();
      void Promise.all([
        supabase.from("v_stock_lines").select("line_key, product_name, variant_name, variant_id, length_ft, breadth_ft, thickness_mm, available, category").gt("available", 0).order("product_name"),
        supabase.from("customers").select("id, name, phone").order("name"),
      ]).then(([l, c]) => {
        setLines(l.data ?? []);
        setCustomers(c.data ?? []);
      });
    },
    [lines],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openPalette(true)}
        className="hidden h-10 w-[260px] items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm hover:bg-secondary md:flex"
        aria-label="Search or jump to"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump to...</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={openPalette} title="Search or jump to" description="Pages, stock lines and customers">
        <Command>
        <CommandInput placeholder="Type a page, stone or customer..." />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => (
              <CommandItem key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)}>
                <item.icon className="size-4" /> {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Stock lines">
            {(lines ?? []).map((l) => {
              const size = formatSize({ length_ft: l.length_ft, breadth_ft: l.breadth_ft, thickness_mm: l.thickness_mm });
              const href = `/yard?line=${encodeURIComponent(l.line_key ?? "")}`;
              return (
                <CommandItem key={l.line_key} value={`stone ${l.product_name} ${l.variant_name} ${size}`} onSelect={() => go(href)}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{l.product_name} · {l.variant_name}</span>
                    <span className="text-xs text-muted-foreground">{size} · {l.available} available</span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Customers">
            {(customers ?? []).map((c) => (
              <CommandItem key={c.id} value={`customer ${c.name} ${c.phone ?? ""}`} onSelect={() => go(`/customers/${c.id}`)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{c.name}</span>
                  {c.phone ? <span className="text-xs text-muted-foreground">{c.phone}</span> : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
