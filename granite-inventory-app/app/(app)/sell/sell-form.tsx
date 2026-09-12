"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AgeingBadge } from "@/components/ageing-badge";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABEL,
  PAYMENT_MODES,
  PAYMENT_MODE_LABEL,
  isCustomerType,
  type PaymentMode,
} from "@/lib/domain";
import type { Tables } from "@/lib/database.types";
import { formatDate, formatRupees, formatSize, todayIso } from "@/lib/format";
import { computeMargin, marginHealth } from "@/lib/margin";
import { phoneDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { CustomerDialog, type CustomerDraft } from "@/components/customer-dialog";
import { recordSaleAction } from "./actions";

type Customer = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;
type Line = Tables<"v_stock_lines">;
type Batch = Tables<"v_yard_batches">;

type Props = {
  readonly customers: readonly Customer[];
  readonly lines: readonly Line[];
  readonly batches: readonly Batch[];
  readonly preselectBatchId: string | null;
};

function num(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function customerDraftFromQuery(query: string): CustomerDraft {
  const trimmed = query.trim();
  const digits = phoneDigits(trimmed);
  const isPhone = digits.length >= 6 && digits.length <= 20;

  return isPhone
    ? { name: "", phone: `${trimmed.startsWith("+") ? "+" : ""}${digits}`, customerType: "REGULAR" }
    : { name: trimmed, phone: "", customerType: "REGULAR" };
}

export function SellForm({ customers: initialCustomers, lines, batches, preselectBatchId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customers, setCustomers] = useState(initialCustomers);
  const preselected = batches.find((b) => b.id === preselectBatchId) ?? null;

  const [saleDate, setSaleDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineKey, setLineKey] = useState<string | null>(preselected?.line_key ?? null);
  const [batchId, setBatchId] = useState<string | null>(preselected?.id ?? null);
  const [quantity, setQuantity] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [miscExpense, setMiscExpense] = useState("");
  const [stickering, setStickering] = useState(false);
  const [stickeringCost, setStickeringCost] = useState("");
  const [stickeringPrice, setStickeringPrice] = useState("");
  const [newCustomer, setNewCustomer] = useState<CustomerDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const lineBatches = useMemo(
    () => (lineKey ? batches.filter((b) => b.line_key === lineKey) : []),
    [batches, lineKey],
  );
  const batch = lineBatches.find((b) => b.id === batchId) ?? null;

  const figures = computeMargin({
    quantity: Math.floor(num(quantity)),
    salePrice: num(salePrice),
    landedCost: batch?.landed_cost ?? 0,
    stickering: stickering ? { cost: num(stickeringCost), price: num(stickeringPrice) } : null,
    miscExpense: num(miscExpense),
  });
  const health = marginHealth(batch ? figures.marginPct : null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordSaleAction({
        batchId,
        customerId,
        saleDate,
        quantity,
        salePrice,
        paymentMode,
        hasStickering: stickering,
        stickeringCost: stickeringCost || 0,
        stickeringPrice: stickeringPrice || 0,
        miscExpense: miscExpense || 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Sale recorded: ${result.data.quantity} from ${batch?.batch_code ?? "batch"}`);
      setBatchId(null);
      setLineKey(null);
      setQuantity("1");
      setSalePrice("");
      setMiscExpense("");
      setStickering(false);
      setStickeringCost("");
      setStickeringPrice("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Sale Date" htmlFor="saleDate">
              <Input id="saleDate" type="date" max={todayIso()} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="h-11" />
            </Field>
            <Field label="Payment Mode">
              <div className="flex min-h-11 flex-wrap items-center gap-2" role="radiogroup" aria-label="Payment Mode">
                {PAYMENT_MODES.map((m) => (
                  <Chip key={m} active={paymentMode === m} onClick={() => setPaymentMode(m)}>{PAYMENT_MODE_LABEL[m]}</Chip>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Customer" htmlFor="customer">
              <SearchSelect
                id="customer"
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  hint: c.phone ?? (c.is_walk_in ? "No phone on file" : undefined),
                  phone: c.phone,
                }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Search or add customer"
                searchPlaceholder="Name or phone..."
                onCreate={(q) => setNewCustomer(customerDraftFromQuery(q))}
                createLabel={(q) => `Add customer "${q}"`}
              />
            </Field>
            <Field label="Contact Number" htmlFor="contact">
              <Input id="contact" readOnly value={customer?.phone ?? ""} placeholder="+91 98765 43210" className="h-11 bg-muted" />
            </Field>
          </div>
          {customer && isCustomerType(customer.customer_type) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {CUSTOMER_TYPES.map((t) => (
                <Chip key={t} active={customer.customer_type === t} disabled>{CUSTOMER_TYPE_LABEL[t]}</Chip>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <Field label="Product / Variant" htmlFor="line">
            <SearchSelect
              id="line"
              options={lines.map((l) => ({
                value: l.line_key ?? "",
                label: `${l.product_name} · ${l.variant_name} · ${formatSize({ length_ft: l.length_ft, breadth_ft: l.breadth_ft, thickness_mm: l.thickness_mm })}`,
                hint: `${l.available} available in ${l.batches_with_stock} ${l.batches_with_stock === 1 ? "batch" : "batches"}`,
                keywords: [l.product_abbreviation ?? "", `${l.length_ft ?? ""}x${l.breadth_ft ?? ""}`],
              }))}
              value={lineKey}
              onChange={(v) => {
                setLineKey(v);
                setBatchId(batches.find((b) => b.line_key === v)?.id ?? null);
              }}
              placeholder="Search product, e.g. Black Pearl 4×2 ft"
              searchPlaceholder="Product, variant or size..."
              emptyText="Nothing in stock matches."
            />
          </Field>
        </Card>

        {lineKey ? (
          <Card>
            <span className="text-[13px] text-muted-foreground">Select batch (oldest first)</span>
            <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Batch">
              {lineBatches.map((b) => {
                const active = b.id === batchId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid="fifo-batch"
                    onClick={() => setBatchId(b.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 rounded-tile border bg-card px-4 py-3 text-left",
                      active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-secondary/60",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {b.product_abbreviation}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {b.product_name} · {b.variant_name} · {b.batch_code} · {formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Bought {b.purchase_date ? formatDate(b.purchase_date) : ""} · {b.available} available · from {b.supplier_name}
                      </span>
                    </span>
                    <AgeingBadge band={b.ageing_band} days={b.age_days} />
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity Sold" htmlFor="quantity" hint={batch ? `${batch.available} available` : undefined}>
              <Input id="quantity" type="number" inputMode="numeric" min="1" step="1" max={batch?.available ?? undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-11" />
            </Field>
            <Field label="Stone Sale Price (₹)" htmlFor="salePrice" hint="Per piece">
              <Input id="salePrice" type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="h-11" />
            </Field>
            <Field label="Misc Expense (₹)" htmlFor="miscExpense" hint="Not part of margin">
              <Input id="miscExpense" type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={miscExpense} onChange={(e) => setMiscExpense(e.target.value)} className="h-11" />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold">Add Stickering / Engraving Service</span>
            <Switch checked={stickering} onCheckedChange={setStickering} aria-label="Add Stickering / Engraving Service" />
          </div>
          {stickering ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Stickering Cost (₹)" htmlFor="stickeringCost" hint="Per piece, paid to the engraver">
                <Input id="stickeringCost" type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={stickeringCost} onChange={(e) => setStickeringCost(e.target.value)} className="h-11" />
              </Field>
              <Field label="Stickering Price (₹)" htmlFor="stickeringPrice" hint="Per piece, charged to the customer">
                <Input id="stickeringPrice" type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={stickeringPrice} onChange={(e) => setStickeringPrice(e.target.value)} className="h-11" />
              </Field>
            </div>
          ) : null}
        </Card>
      </div>

      <aside aria-label="Order summary" className="rounded-card bg-card p-6 shadow-sm lg:sticky lg:top-6" data-testid="order-summary">
        <h2 className="text-base font-bold">Order Summary</h2>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Stone Sale Price" value={formatRupees(figures.stoneTotal)} />
          <Row label="Landed Cost (auto)" sub="From the batch, freight included" value={batch ? formatRupees(figures.landedTotal) : "Pick a batch"} muted />
          <Row label="Base Margin" value={formatRupees(figures.stoneMargin)} />
          <Row label="Misc Expense" sub="Tracked separately, not part of margin" value={formatRupees(num(miscExpense))} />
          {stickering ? <Row label="Stickering Margin" value={formatRupees(figures.stickeringMargin)} /> : null}
        </dl>
        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Margin</div>
            <div className="text-3xl font-bold tabular" data-testid="total-margin">{formatRupees(figures.margin)}</div>
          </div>
          <span
            data-testid="margin-pct"
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold tabular",
              health === "good" && "bg-fresh-soft text-fresh",
              health === "ok" && "bg-ageing-soft text-ageing",
              health === "bad" && "bg-stale-soft text-stale",
              health === "none" && "bg-muted text-muted-foreground",
            )}
          >
            {figures.marginPct === null || !batch ? "0%" : `${figures.marginPct.toFixed(1)}%`}
          </span>
        </div>
        {error ? <Notice tone="error" icon="alert" className="mt-4">{error}</Notice> : null}
        <Button type="submit" disabled={pending || !batch || !customer} className="mt-5 h-12 w-full text-base font-semibold">
          {pending ? "Recording..." : "Record Sale"}
        </Button>
      </aside>

      <CustomerDialog
        draft={newCustomer}
        onClose={() => setNewCustomer(null)}
        onSaved={(c) => {
          setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
          setCustomerId(c.id);
          setNewCustomer(null);
        }}
      />
    </form>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 rounded-card bg-card p-5 shadow-sm">{children}</section>;
}

function Chip({ active, onClick, disabled, children }: { active: boolean; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role={onClick ? "radio" : undefined}
      aria-checked={onClick ? active : undefined}
      onClick={onClick}
      disabled={disabled && !active}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
        active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground",
        disabled && !active && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, sub, value, muted }: { label: string; sub?: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">
        {label}
        {sub ? <span className="block text-xs text-muted-foreground">{sub}</span> : null}
      </dt>
      <dd className={cn("font-semibold tabular", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}
