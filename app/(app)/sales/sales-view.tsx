"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { useMember } from "@/components/shell/member-provider";
import { ViewError, ViewReady } from "@/components/view-state";
import { billContext } from "@/lib/bill-context";
import { dayFromParam } from "@/lib/daily-sales";
import { formatPercent, formatRupees, istToday } from "@/lib/format";
import { useHydrated } from "@/lib/query/provider";
import { customersQuery, dailySalesQuery, yardBatchesQuery, type DailySummary } from "@/lib/query/reads";
import { cn } from "@/lib/utils";
import type { SaleEditLists } from "../customers/[id]/sale-actions";
import { SalesTable } from "../customers/[id]/sales-rows";
import { DayPicker } from "./day-picker";
import { LaterPayments } from "./later-payments";

export function SalesView({ skeleton }: { readonly skeleton: ReactNode }) {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const today = istToday();
  const day = dayFromParam(params.get("date"), today);
  const isAdmin = useMember().role === "ADMIN";
  const daily = useQuery({ ...dailySalesQuery(day), placeholderData: keepPreviousData });
  const batches = useQuery({ ...yardBatchesQuery, enabled: isAdmin });
  const customers = useQuery({ ...customersQuery, enabled: isAdmin });
  const context = useMemo(() => (daily.data ? billContext(daily.data) : null), [daily.data]);

  if (daily.isError) return <ViewError what="daily sales" message={daily.error.message} />;
  if (!hydrated || !daily.data || !context) return skeleton;

  const editLists: SaleEditLists | null =
    batches.data && customers.data ? { batches: batches.data, customers: customers.data } : null;
  const { summary, sales, laterToday } = daily.data;

  return (
    <ViewReady>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={daily.dataUpdatedAt} fetching={daily.isFetching} />
      </div>
      <DayPicker day={day} today={today} />
      <div
        className={cn("contents", daily.isPlaceholderData && "[&>*]:opacity-60")}
        inert={daily.isPlaceholderData}
        aria-busy={daily.isPlaceholderData}
      >
        <Summary summary={summary} />
        <section className="rounded-card bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold">Sales</h2>
          {sales.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sales on this day.</p>
          ) : (
            <SalesTable
              sales={sales}
              editLists={editLists}
              billPayments={context.billPayments}
              credit={context.creditRows}
              laterPayments={context.laterPayments}
              lead="customer"
            />
          )}
        </section>
        {laterToday.length > 0 ? <LaterPayments receipts={laterToday} /> : null}
      </div>
    </ViewReady>
  );
}

function Summary({ summary }: { readonly summary: DailySummary }) {
  return (
    <dl
      className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-[1fr_1fr_1.5fr_1fr] lg:gap-x-0 lg:divide-x lg:divide-border"
      data-testid="daily-summary"
    >
      <Kpi label="Billed" value={formatRupees(summary.billed)} testId="daily-billed" />
      <Kpi
        label="Margin"
        value={formatRupees(summary.margin)}
        note={summary.margin_pct === null ? undefined : formatPercent(summary.margin_pct)}
        testId="daily-margin"
      />
      <Kpi
        label="Money received"
        value={formatRupees(summary.received)}
        note={`Cash ${formatRupees(summary.cash)} · UPI ${formatRupees(summary.upi)} · Bank\u00a0Transfer\u00a0${formatRupees(summary.bank_transfer)}`}
        testId="daily-received"
      />
      <Kpi label="Added to credit" value={formatRupees(summary.added_to_credit)} testId="daily-credit" />
    </dl>
  );
}

function Kpi({
  label,
  value,
  note,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly testId: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 lg:pr-6 lg:pl-6 lg:first:pl-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular" data-testid={testId}>
        {value}
      </dd>
      {note ? <dd className="text-xs text-muted-foreground tabular">{note}</dd> : null}
    </div>
  );
}
