const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatRupees(value: number): string {
  return `₹${inr.format(Math.round(value))}`;
}

/* Compact rupees for KPI tiles: ₹5.2L, ₹1.2Cr. */
export function formatRupeesCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  return formatRupees(value);
}

export function formatNumber(value: number): string {
  return inr.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00`));
}

export function formatSize(input: {
  length_ft: number | null;
  breadth_ft: number | null;
  thickness_mm: number | null;
}): string {
  if (input.length_ft === null || input.breadth_ft === null) return "Fixed size";
  const dims = `${trimNumber(input.length_ft)}×${trimNumber(input.breadth_ft)} ft`;
  return input.thickness_mm === null ? dims : `${dims}, ${input.thickness_mm}mm`;
}

export function formatDims(length_ft: number | null, breadth_ft: number | null): string {
  if (length_ft === null || breadth_ft === null) return "Fixed size";
  return `${trimNumber(length_ft)} × ${trimNumber(breadth_ft)} ft`;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, "");
}

export function todayIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function relativeDays(iso: string): string {
  const then = new Date(`${iso}T00:00:00`);
  const now = new Date(`${todayIso()}T00:00:00`);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function pluralUnits(count: number, category: string): string {
  const noun = category === "GRANITE" ? "slab" : category === "TILES" ? "box" : "unit";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
