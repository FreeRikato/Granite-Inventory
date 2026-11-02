import { addDays, format, parseISO } from "date-fns";
import { PAYMENT_MODE_LABEL } from "@/lib/domain";
import { formatRupees } from "@/lib/format";
import type { ReceivedRow } from "@/lib/query/reads";
import { cn } from "@/lib/utils";
import type { ReceivedGrain } from "./received-bars";

const HEADING = { week: "Week", month: "Month", day: "Day" } as const satisfies Record<ReceivedGrain, string>;

function Label({ grain, periodStart }: { readonly grain: ReceivedGrain; readonly periodStart: string }) {
  const start = parseISO(periodStart);
  if (grain === "month") return <>{format(start, "MMM yyyy")}</>;
  if (grain === "day") return <>{format(start, "d MMM")}</>;
  return (
    <>
      <span className="sm:hidden">{format(start, "d MMM")}</span>
      <span className="hidden sm:inline">
        {format(start, "d MMM")} to {format(addDays(start, 6), "d MMM")}
      </span>
    </>
  );
}

function Money({ value, testId }: { readonly value: number; readonly testId?: string }) {
  return (
    <td
      className={cn("py-2.5 pr-2 text-right sm:py-3 sm:pr-4", value === 0 && "text-muted-foreground")}
      data-testid={testId}
    >
      {formatRupees(value)}
    </td>
  );
}

export function ReceivedTable({
  rows,
  grain,
}: {
  readonly rows: readonly ReceivedRow[];
  readonly grain: ReceivedGrain;
}) {
  const newestFirst = rows.toReversed();
  const sum = (pick: (r: ReceivedRow) => number) => rows.reduce((acc, r) => acc + pick(r), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular sm:text-sm" data-testid="received-table">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-2 text-left font-medium whitespace-nowrap sm:pr-4">{HEADING[grain]}</th>
            <th className="py-2 pr-2 text-right font-medium sm:pr-4">{PAYMENT_MODE_LABEL.CASH}</th>
            <th className="py-2 pr-2 text-right font-medium sm:pr-4">{PAYMENT_MODE_LABEL.UPI}</th>
            <th className="py-2 pr-2 text-right font-medium whitespace-nowrap sm:pr-4">
              <span className="sm:hidden">Bank</span>
              <span className="hidden sm:inline">{PAYMENT_MODE_LABEL.BANK_TRANSFER}</span>
            </th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((r, i) => {
            const now = grain !== "day" && i === 0;
            return (
              <tr key={r.period_start} className="border-b border-border" data-testid="received-row" data-now={now}>
                <td className="py-2.5 pr-2 font-medium whitespace-nowrap sm:py-3 sm:pr-4">
                  <span className={cn(now && "text-accent-foreground sm:text-foreground")}>
                    <Label grain={grain} periodStart={r.period_start} />
                  </span>
                  {now ? (
                    <span className="ml-1.5 hidden rounded-full bg-accent px-1.5 py-px align-[1px] text-[10px] font-semibold text-accent-foreground sm:inline">
                      now
                    </span>
                  ) : null}
                </td>
                <Money value={r.cash} testId="received-cash" />
                <Money value={r.upi} testId="received-upi" />
                <Money value={r.bank_transfer} testId="received-bank" />
                <td className="py-2.5 text-right sm:py-3" data-testid="received-row-total">
                  {formatRupees(r.total)}
                </td>
              </tr>
            );
          })}
          <tr className="font-semibold" data-testid="received-total">
            <td className="pt-3 pr-2 sm:pr-4">Total</td>
            <td className="pt-3 pr-2 text-right sm:pr-4" data-testid="received-cash">
              {formatRupees(sum((r) => r.cash))}
            </td>
            <td className="pt-3 pr-2 text-right sm:pr-4" data-testid="received-upi">
              {formatRupees(sum((r) => r.upi))}
            </td>
            <td className="pt-3 pr-2 text-right sm:pr-4" data-testid="received-bank">
              {formatRupees(sum((r) => r.bank_transfer))}
            </td>
            <td className="pt-3 text-right" data-testid="received-grand-total">
              {formatRupees(sum((r) => r.total))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
