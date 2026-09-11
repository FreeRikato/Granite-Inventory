import { formatDate, formatRupees, formatSize } from "@/lib/format";
import { SLOT_LABEL, isSlot } from "@/lib/domain";
import type { Tables } from "@/lib/database.types";

type Row = Tables<"v_batches">;

export function RecentBatches({ batches }: { readonly batches: readonly Row[] }) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold">Recent batches</h2>
      {batches.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No batches logged yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Batch</th>
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                <th className="py-2 pr-4 font-medium">Slot</th>
                <th className="py-2 pr-4 font-medium">Bought</th>
                <th className="py-2 pr-4 text-right font-medium">Pieces</th>
                <th className="py-2 text-right font-medium">Landed cost</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id ?? b.batch_code} className="border-t border-border" data-testid="batch-row">
                  <td className="py-2.5 pr-4 font-mono text-xs">{b.batch_code}</td>
                  <td className="py-2.5 pr-4 font-medium">
                    {b.product_name} · {b.variant_name}
                  </td>
                  <td className="py-2.5 pr-4">
                    {formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })}
                  </td>
                  <td className="py-2.5 pr-4">{isSlot(b.slot) ? SLOT_LABEL[b.slot] : b.slot}</td>
                  <td className="py-2.5 pr-4">{b.purchase_date ? formatDate(b.purchase_date) : ""}</td>
                  <td className="py-2.5 pr-4 text-right tabular">{b.available} / {b.initial_units}</td>
                  <td className="py-2.5 text-right tabular">{formatRupees(b.landed_cost ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
