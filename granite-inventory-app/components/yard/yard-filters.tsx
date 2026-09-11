"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { YardQuery } from "@/lib/yard";

type Option = { readonly value: string; readonly label: string };

type Props = {
  readonly query: YardQuery;
  readonly products: readonly Option[];
  readonly variants: readonly Option[];
  readonly thicknesses: readonly number[];
  readonly suppliers: readonly Option[];
};

const ALL = "__all__";

/* Every filter lives in the URL so a filtered yard can be linked to (dashboard, palette). */
export function YardFilters({ query, products, variants, thicknesses, suppliers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(query.q);

  const update = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === "" || v === ALL) sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (text === query.q) return;
    const t = setTimeout(() => update({ q: text }), 250);
    return () => clearTimeout(t);
  }, [text, query.q, update]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search product, variant or supplier..."
            className="h-10 rounded-full bg-card pl-9"
            aria-label="Search batches"
          />
        </div>
        {query.line ? (
          <Button type="button" variant="outline" size="sm" className="h-10 rounded-full bg-card" onClick={() => update({ line: null })}>
            <X className="size-3.5" /> Clear stock line
          </Button>
        ) : null}
        <FilterSelect label="Product" value={query.product} options={products} onChange={(v) => update({ product: v, variant: null })} />
        <FilterSelect label="Variant" value={query.variant} options={variants} onChange={(v) => update({ variant: v })} />
        <FilterSelect
          label="Thickness"
          value={query.thickness === null ? null : String(query.thickness)}
          options={thicknesses.map((t) => ({ value: String(t), label: `${t}mm` }))}
          onChange={(v) => update({ thickness: v })}
        />
        <FilterSelect label="Supplier" value={query.supplier} options={suppliers} onChange={(v) => update({ supplier: v })} />
        <FilterSelect
          label="Age"
          value={query.band === "STALE" ? "stale" : query.age === null ? null : String(query.age)}
          options={[
            { value: "90", label: "Over 90 days" },
            { value: "180", label: "Over 180 days" },
            { value: "365", label: "Over 365 days" },
            { value: "stale", label: "Stale band" },
          ]}
          onChange={(v) => update({ age: v })}
        />
        <Select value={query.sort} onValueChange={(v) => update({ sort: v === "newest" ? "newest" : null })}>
          <SelectTrigger className="h-10 rounded-full bg-card" aria-label="Sort">
            <ArrowUpDown className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Sort: Oldest first</SelectItem>
            <SelectItem value="newest">Sort: Newest first</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 pl-1">
          <Switch id="show-sold" checked={query.sold} onCheckedChange={(c) => update({ sold: c ? "1" : null })} />
          <Label htmlFor="show-sold" className="text-sm text-muted-foreground">Show sold out</Label>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly Option[];
  onChange: (value: string | null) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className="h-10 rounded-full bg-card" aria-label={label}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
