import { Archive } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { rowStateClass } from "@/lib/query/row-style";
import { cn } from "@/lib/utils";
import { formatDate, formatRupees, formatSize } from "@/lib/format";
import { slotLabel, stackLabel } from "@/lib/domain";
import type { Tables } from "@/lib/database.types";
import { BatchActions, type EditLists } from "@/components/yard/batch-actions";

type Row = Tables<"v_batches">;

type Props = {
  readonly batches: readonly Row[];
  readonly editLists: EditLists | null;
  readonly showArchived: boolean;
  readonly onShowArchivedChange: (value: boolean) => void;
};

export function RecentBatches({ batches, editLists, showArchived, onShowArchivedChange }: Props) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Recent batches</h2>
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <Switch id="recent-show-archived" checked={showArchived} onCheckedChange={onShowArchivedChange} />
          <Label htmlFor="recent-show-archived" className="text-sm text-muted-foreground">
            Show archived
          </Label>
        </div>
      </div>
      {batches.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No batches logged yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Purchase code</th>
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                <th className="py-2 pr-4 font-medium">Slot</th>
                <th className="py-2 pr-4 font-medium">Bought</th>
                <th className="py-2 pr-4 text-right font-medium">Pieces</th>
                <th className="py-2 pr-4 text-right font-medium">Landed cost</th>
                <th className="py-2 text-right font-medium">Total cost</th>
                {editLists ? (
                  <th className="relative w-28 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr
                  key={b.id ?? b.batch_code}
                  className={cn(
                    "group animate-in border-t border-border fade-in motion-enter",
                    rowStateClass,
                    b.archived_at && "opacity-60",
                  )}
                  data-testid="batch-row"
                >
                  <td className="py-2.5 pr-4 font-mono text-xs">
                    {b.batch_code}
                    {b.archived_at ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Archive className="size-3" aria-hidden="true" />
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 font-medium">{b.product_name}</td>
                  <td className="py-2.5 pr-4">
                    {formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })}
                  </td>
                  <td className="py-2.5 pr-4">
                    {b.slot ? (b.stack_number ? stackLabel(b.slot, b.stack_number) : slotLabel(b.slot)) : null}
                  </td>
                  <td className="py-2.5 pr-4">{b.purchase_date ? formatDate(b.purchase_date) : ""}</td>
                  <td className="py-2.5 pr-4 text-right tabular">
                    {b.available} / {b.initial_units}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular">{formatRupees(b.landed_cost ?? 0)}</td>
                  <td className="py-2.5 text-right tabular">{formatRupees(b.total_cost ?? 0)}</td>
                  {editLists ? (
                    <td className="py-1 pl-2">
                      <div className="flex justify-end gap-1 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        <BatchActions batch={b} lists={editLists} iconOnly />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
