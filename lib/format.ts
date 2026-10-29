const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatRupees(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}₹${inr.format(Math.abs(rounded))}`;
}

export function formatRupeesCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  return formatRupees(value);
}

function trimTenths(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatRupeesAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trimTenths(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trimTenths(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trimTenths(abs / 1e3)}K`;
  return formatRupees(value);
}

export function formatNumber(value: number): string {
  return inr.format(value);
}

const areaFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

function toHundredths(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(Number(`${parsed}e2`)) / 100 : Number.NaN;
}

export function formatArea(lengthFt: string, breadthFt: string): string {
  const length = toHundredths(lengthFt);
  const breadth = toHundredths(breadthFt);
  return length > 0 && breadth > 0 ? areaFmt.format(length * breadth) : "";
}

export function formatAreaTotal(lengthFt: string, breadthFt: string, quantity: number): string {
  const length = toHundredths(lengthFt);
  const breadth = toHundredths(breadthFt);
  return length > 0 && breadth > 0 && Number.isInteger(quantity) && quantity > 0
    ? areaFmt.format(length * breadth * quantity)
    : "";
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
