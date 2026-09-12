"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { StoneTile } from "@/components/catalog/stone-tile";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/domain";
import type { Tables } from "@/lib/database.types";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";

type Line = Tables<"v_public_catalog">;

type Props = {
  readonly businessName: string;
  readonly tagline: string;
  readonly whatsappNumber: string;
  readonly lines: readonly Line[];
};

export function CatalogView({ businessName, tagline, whatsappNumber, lines }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (category && l.category !== category) return false;
      if (!q) return true;
      const size = formatSize({ length_ft: l.length_ft, breadth_ft: l.breadth_ft, thickness_mm: l.thickness_mm });
      return `${l.product_name} ${l.variant_name} ${size} ${l.thickness_mm ?? ""}mm`.toLowerCase().includes(q);
    });
  }, [lines, query, category]);

  const generalLink = whatsappLink(whatsappNumber, `Hi ${businessName}, I saw your stock catalog and have a question.`);

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1344px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold">
                {businessName}
                <span className="inline-flex items-center gap-1 text-xs font-medium text-fresh"><span className="size-1.5 rounded-full bg-fresh" />Live</span>
              </h1>
              {tagline ? <p className="text-sm text-muted-foreground">{tagline}</p> : null}
            </div>
            <ThemeToggle className="md:hidden" />
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stone, size, thickness..." className="h-10 rounded-full pl-9" aria-label="Search stock" />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden md:inline-flex" />
            {generalLink ? (
              <a href={generalLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-whatsapp px-4 text-sm font-semibold text-white">
                <MessageCircle className="size-4" /> Call to Inquire
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1344px] px-4 py-5 md:px-6">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category">
          <CategoryChip active={category === null} onClick={() => setCategory(null)}>All</CategoryChip>
          {CATEGORIES.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABEL[c]}</CategoryChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {lines.length === 0 ? "Nothing in stock right now. Check back soon." : "Nothing matches your search."}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((l) => {
              const size = l.length_ft === null ? "standard size" : formatSize({ length_ft: l.length_ft, breadth_ft: l.breadth_ft, thickness_mm: l.thickness_mm });
              const link = whatsappLink(whatsappNumber, `Hi ${businessName}, is ${l.product_name} ${l.variant_name} (${size}) available? I saw ${l.available} in stock.`);
              return (
                <div key={l.line_key} className="flex flex-col gap-2">
                  <StoneTile line={l} />
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-card text-xs font-semibold hover:bg-secondary">
                      <MessageCircle className="size-3.5" /> Call to Inquire about this stone
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {generalLink ? (
        <a href={generalLink} target="_blank" rel="noreferrer" className="fixed bottom-4 right-4 inline-flex h-12 items-center gap-2 rounded-full bg-whatsapp px-5 text-sm font-semibold text-white shadow-lg md:hidden">
          <MessageCircle className="size-4" /> Call to Inquire
        </a>
      ) : null}
    </main>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
        active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

