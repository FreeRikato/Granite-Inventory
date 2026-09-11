"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { CustomerDialog, type CustomerDraft } from "@/components/customer-dialog";
import { CustomerTypeBadge, initialsOf } from "@/components/customer-type-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/lib/database.types";
import { relativeDays } from "@/lib/format";

type Row = Tables<"v_customers">;

type Props = {
  readonly customers: readonly Row[];
  readonly header: ReactNode;
  readonly kpis: readonly { label: string; value: number }[];
};

export function CustomerList({ customers, header, kpis }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CustomerDraft | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <Button className="h-10 font-semibold" onClick={() => setDraft({ name: "", phone: "", customerType: "REGULAR" })}>
          <Plus className="size-4" /> Add Customer
        </Button>
      </div>

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
                <Link href={`/customers/${c.id}`} className="flex items-center gap-4 py-4 hover:bg-secondary/40" data-testid="customer-row">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {initialsOf(c.name ?? "")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.phone ?? "No phone on file"}</span>
                  </span>
                  <span className="hidden text-sm text-muted-foreground sm:block">
                    {c.last_purchase_date ? relativeDays(c.last_purchase_date) : "No purchases"}
                  </span>
                  <CustomerTypeBadge type={c.customer_type} className="w-28 justify-center" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CustomerDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); router.refresh(); }} />
    </>
  );
}
