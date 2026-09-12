"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CustomerTypeBadge, initialsOf } from "@/components/customer-type-badge";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/lib/database.types";
import { relativeDays } from "@/lib/format";

type Row = Tables<"v_customers">;

type Props = {
  readonly customers: readonly Row[];
  readonly kpis: readonly { label: string; value: number }[];
};

export function CustomerList({ customers, kpis }: Props) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <>

      <dl className="flex divide-x divide-border">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 pr-6 pl-6 first:pl-0">
            <dt className="text-sm text-muted-foreground">{k.label}</dt>
            <dd className="text-2xl font-bold tabular">{k.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone..." className="h-10 rounded-full bg-card pl-9" aria-label="Search customers" />
      </div>

      <div className="rounded-card bg-card px-6 shadow-sm">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No customers match.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex flex-wrap items-start gap-4 py-4 hover:bg-secondary/40" data-testid="customer-row">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {initialsOf(c.name ?? "")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words text-[15px] font-semibold">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.phone ?? "No phone on file"}</span>
                  </span>
                  <span className="hidden text-sm text-muted-foreground sm:block">
                    {c.last_purchase_date ? relativeDays(c.last_purchase_date) : "No purchases"}
                  </span>
                  <span className="basis-full sm:hidden" />
                  <CustomerTypeBadge type={c.customer_type} className="ml-12 w-28 justify-center sm:ml-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

    </>
  );
}
