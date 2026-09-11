import { formatSize, pluralUnits } from "@/lib/format";

type Line = {
  readonly product_name: string | null;
  readonly variant_name: string | null;
  readonly category: string | null;
  readonly length_ft: number | null;
  readonly breadth_ft: number | null;
  readonly thickness_mm: number | null;
  readonly available: number | null;
};

/* Photos are Phase 2. Until then each stone gets a stable two-tone swatch from its name. */
function swatch(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const dark = name.toLowerCase().includes("black") || name.toLowerCase().includes("grey");
  const light = name.toLowerCase().includes("white") || name.toLowerCase().includes("doom");
  const l1 = dark ? 14 : light ? 78 : 40;
  const l2 = dark ? 26 : light ? 68 : 30;
  return `linear-gradient(135deg, hsl(${h} 12% ${l1}%), hsl(${h} 10% ${l2}%))`;
}

export function StoneTile({ line, compact }: { readonly line: Line; readonly compact?: boolean }) {
  const name = `${line.product_name ?? ""}${line.variant_name ? ` · ${line.variant_name}` : ""}`;
  return (
    <article className="rounded-card border border-border bg-card p-3 shadow-sm" data-testid="catalog-tile">
      <div
        className={compact ? "aspect-[2/1] w-full rounded-tile" : "aspect-[3/2] w-full rounded-tile"}
        style={{ background: swatch(line.product_name ?? "") }}
        aria-hidden
      />
      <h3 className="mt-3 text-[15px] font-semibold">{name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {line.length_ft === null ? "Standard size" : formatSize({ length_ft: line.length_ft, breadth_ft: line.breadth_ft, thickness_mm: line.thickness_mm })}
      </p>
      <p className="mt-2 text-sm font-semibold text-primary tabular">
        {pluralUnits(line.available ?? 0, line.category ?? "")} in stock
      </p>
    </article>
  );
}
