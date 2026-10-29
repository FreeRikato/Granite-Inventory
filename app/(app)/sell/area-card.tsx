import { formatArea, formatAreaTotal } from "@/lib/format";

type Props = {
  readonly lengthFt: number | null;
  readonly breadthFt: number | null;
  readonly quantity: number;
};

export function AreaCard({ lengthFt, breadthFt, quantity }: Props) {
  const length = String(lengthFt ?? "");
  const breadth = String(breadthFt ?? "");
  const total = formatAreaTotal(length, breadth, quantity);
  if (total === "") return null;
  return (
    <div data-testid="area-card" className="flex shrink-0 flex-col rounded-tile bg-muted px-4 py-2">
      <span className="text-lg font-bold tabular">{total} sq ft</span>
      <span className="text-xs text-muted-foreground tabular">{formatArea(length, breadth)} per piece</span>
    </div>
  );
}
