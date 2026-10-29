"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useAfterWrite } from "@/lib/query/provider";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddButton } from "@/components/add-button";
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
import { useRefusal } from "@/lib/use-refusal";
import { computeMargin, marginHealth } from "@/lib/margin";
import { billLineSchema, type BillLineInput } from "@/lib/schemas/sale";
import { phoneDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { CustomerDialog, type CustomerDraft } from "@/components/customer-dialog";
import { recordBillAction } from "./actions";
import { AreaCard } from "./area-card";
import { addLine, describeOrder, orderFigures, piecesInCart, removeLine, type CartLine } from "./cart";
import { SplitDialog } from "./split-dialog";

type Customer = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;
type Line = Tables<"v_stock_lines">;
type Batch = Tables<"v_yard_batches">;

type Props = {
  readonly customers: readonly Customer[];
  readonly lines: readonly Line[];
  readonly batches: readonly Batch[];
  readonly preselectBatchId: string | null;
};

export function customerDraftFromQuery(query: string): CustomerDraft {
  const trimmed = query.trim();
  const digits = phoneDigits(trimmed);
  const isPhone = digits.length >= 6 && digits.length <= 20;

  return isPhone
    ? { name: "", phone: `${trimmed.startsWith("+") ? "+" : ""}${digits}`, customerType: "REGULAR" }
    : { name: trimmed, phone: "", customerType: "REGULAR" };
}

export function SellForm({ customers: initialCustomers, lines, batches, preselectBatchId }: Props) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [addedCustomers, setAddedCustomers] = useState<readonly Customer[]>([]);
  const customers = useMemo(() => {
    const byId = new Map(initialCustomers.map((c) => [c.id, c]));
    for (const c of addedCustomers) byId.set(c.id, c);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [initialCustomers, addedCustomers]);
  const preselected = batches.find((b) => b.id === preselectBatchId) ?? null;

  const [saleDate, setSaleDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineKey, setLineKey] = useState<string | null>(preselected?.line_key ?? null);
  const [batchId, setBatchId] = useState<string | null>(preselected?.id ?? null);
  const [quantity, setQuantity] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [stickering, setStickering] = useState(false);
  const [stickeringCost, setStickeringCost] = useState("");
  const [stickeringPrice, setStickeringPrice] = useState("");
  const [newCustomer, setNewCustomer] = useState<CustomerDraft | null>(null);
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [split, setSplit] = useState<BillLineInput | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addRefusal = useRefusal([
    cart,
    lineKey,
    batchId,
    quantity,
    salePrice,
    stickering,
    stickeringCost,
    stickeringPrice,
  ]);
  const { error, refuse, clear } = useRefusal([saleDate, paymentMode, customerId, cart]);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const lineBatches = useMemo(() => (lineKey ? batches.filter((b) => b.line_key === lineKey) : []), [batches, lineKey]);
  const batch = lineBatches.find((b) => b.id === batchId) ?? null;
  const remaining = (b: Batch) => (b.available ?? 0) - piecesInCart(cart, b.id);
  const remainingOfLine = (l: Line) =>
    (l.available ?? 0) -
    batches.filter((b) => b.line_key === l.line_key).reduce((sum, b) => sum + piecesInCart(cart, b.id), 0);
  const firstWithStock = (key: string) => {
    const options = batches.filter((b) => b.line_key === key);
    return (options.find((b) => remaining(b) > 0) ?? options[0])?.id ?? null;
  };

  const figures = orderFigures(cart);
  const health = marginHealth(cart.length > 0 ? figures.marginPct : null);

  function resetLineFields() {
    setBatchId(null);
    setLineKey(null);
    setQuantity("1");
    setSalePrice("");
    setStickering(false);
    setStickeringCost("");
    setStickeringPrice("");
  }

  function addToOrder() {
    if (!batch) return;
    const parsed = billLineSchema.safeParse({
      batchId: batch.id,
      quantity,
      salePrice,
      hasStickering: stickering,
      stickeringCost: stickeringCost || 0,
      stickeringPrice: stickeringPrice || 0,
    });
    if (!parsed.success) {
      addRefusal.refuse(parsed.error.issues[0]?.message ?? "Check the line");
      return;
    }
    const line = parsed.data;
    if (line.quantity <= remaining(batch)) {
      addToCart(cartLineFor(batch, line, line.quantity));
      return;
    }
    const stock = lineBatches.reduce((sum, b) => sum + remaining(b), 0);
    if (line.quantity > stock) {
      addRefusal.refuse(`Only ${stock} in stock`);
      return;
    }
    setSplit(line);
  }

  function cartLineFor(b: Batch, line: BillLineInput, pieces: number): CartLine {
    return {
      batchId: b.id ?? "",
      batchCode: b.batch_code ?? "",
      productName: b.product_name ?? "",
      size: formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm }),
      lengthFt: b.length_ft,
      breadthFt: b.breadth_ft,
      quantity: pieces,
      salePrice: line.salePrice,
      landedCost: b.landed_cost ?? 0,
      stickering: line.hasStickering ? { cost: line.stickeringCost, price: line.stickeringPrice } : null,
    };
  }

  function addToCart(...added: readonly CartLine[]) {
    setCart(added.reduce(addLine, cart));
    resetLineFields();
  }

  function confirmSplit(takes: readonly number[]) {
    if (!split) return;
    const added = lineBatches.flatMap((b, i) => ((takes[i] ?? 0) > 0 ? [cartLineFor(b, split, takes[i] ?? 0)] : []));
    setSplit(null);
    addToCart(...added);
  }

  function returnFocusAfterSplit(event: Event) {
    event.preventDefault();
    const target = addButtonRef.current?.disabled === false ? addButtonRef.current : document.getElementById("line");
    target?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    clear();
    startTransition(async () => {
      const result = await recordBillAction({
        customerId,
        saleDate,
        paymentMode,
        lines: cart.map((l) => ({
          batchId: l.batchId,
          quantity: l.quantity,
          salePrice: l.salePrice,
          hasStickering: l.stickering !== null,
          stickeringCost: l.stickering?.cost ?? 0,
          stickeringPrice: l.stickering?.price ?? 0,
        })),
      });
      if (!result.ok) {
        refuse(result.error);
        return;
      }
      toast.success(`Sale recorded: ${cart.map((l) => `${l.quantity} from ${l.batchCode}`).join(", ")}`);
      setCart([]);
      resetLineFields();
      afterWrite();
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Sale Date" htmlFor="saleDate">
              <Input
                id="saleDate"
                type="date"
                max={todayIso()}
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="Payment Mode">
              <div className="flex min-h-11 flex-wrap items-center gap-2" role="radiogroup" aria-label="Payment Mode">
                {PAYMENT_MODES.map((m) => (
                  <Chip key={m} active={paymentMode === m} onClick={() => setPaymentMode(m)}>
                    {PAYMENT_MODE_LABEL[m]}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Customer" htmlFor="customer">
              <div className="flex gap-2">
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
                  className="min-w-0 flex-1"
                />
                <AddButton
                  label="Add new customer"
                  onClick={() => setNewCustomer({ name: "", phone: "", customerType: "REGULAR" })}
                />
              </div>
            </Field>
            <Field label="Contact Number" htmlFor="contact">
              <Input
                id="contact"
                readOnly
                value={customer?.phone ?? ""}
                placeholder="+91 98765 43210"
                className="h-11 bg-muted"
              />
            </Field>
          </div>
          {customer && isCustomerType(customer.customer_type) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {CUSTOMER_TYPES.map((t) => (
                <Chip key={t} active={customer.customer_type === t} disabled>
                  {CUSTOMER_TYPE_LABEL[t]}
                </Chip>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <Field label="Product" htmlFor="line">
            <SearchSelect
              id="line"
              options={lines.map((l) => ({
                value: l.line_key ?? "",
                label: `${l.product_name} · ${formatSize({ length_ft: l.length_ft, breadth_ft: l.breadth_ft, thickness_mm: l.thickness_mm })}`,
                hint: `${remainingOfLine(l)} available in ${l.batches_with_stock} ${l.batches_with_stock === 1 ? "batch" : "batches"}`,
                keywords: [l.product_abbreviation ?? "", `${l.length_ft ?? ""}x${l.breadth_ft ?? ""}`],
              }))}
              value={lineKey}
              onChange={(v) => {
                setLineKey(v);
                setBatchId(firstWithStock(v));
              }}
              placeholder="Search product, e.g. Black Pearl 4×2 ft"
              searchPlaceholder="Product or size..."
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
                        {b.product_name} · {b.batch_code} ·{" "}
                        {formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Bought {b.purchase_date ? formatDate(b.purchase_date) : ""} · {remaining(b)} available · from{" "}
                        {b.supplier_name}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Quantity Sold" htmlFor="quantity" hint={batch ? `${remaining(batch)} available` : undefined}>
              <Input
                id="quantity"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="Stone Sale Price (₹)" htmlFor="salePrice" hint="Per piece">
              <Input
                id="salePrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="h-11"
              />
            </Field>
          </div>
          {batch ? (
            <div className="mt-4 flex">
              <AreaCard lengthFt={batch.length_ft} breadthFt={batch.breadth_ft} quantity={Number(quantity)} />
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold">Add Stickering / Engraving Service</span>
            <Switch
              checked={stickering}
              onCheckedChange={setStickering}
              aria-label="Add Stickering / Engraving Service"
            />
          </div>
          {stickering ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Stickering Cost (₹)" htmlFor="stickeringCost" hint="Per piece, paid to the engraver">
                <Input
                  id="stickeringCost"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={stickeringCost}
                  onChange={(e) => setStickeringCost(e.target.value)}
                  className="h-11"
                />
              </Field>
              <Field label="Stickering Price (₹)" htmlFor="stickeringPrice" hint="Per piece, charged to the customer">
                <Input
                  id="stickeringPrice"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={stickeringPrice}
                  onChange={(e) => setStickeringPrice(e.target.value)}
                  className="h-11"
                />
              </Field>
            </div>
          ) : null}
        </Card>

        <div className="flex flex-col gap-3">
          {addRefusal.error ? (
            <Notice tone="error" icon="alert">
              {addRefusal.error}
            </Notice>
          ) : null}
          <Button
            ref={addButtonRef}
            type="button"
            variant="secondary"
            disabled={!batch || pending}
            onClick={addToOrder}
            className="h-11 w-full"
          >
            Add to order
          </Button>
        </div>

        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold">This order</h2>
            {cart.length > 0 ? (
              <span className="text-sm text-muted-foreground" data-testid="order-count">
                {describeOrder(cart)}
              </span>
            ) : null}
          </div>
          {cart.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No lines yet. Add a product to start the order.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {cart.map((l, index) => (
                <li
                  key={`${l.batchId}-${l.salePrice}-${l.stickering?.cost ?? "none"}-${l.stickering?.price ?? "none"}`}
                  data-testid="cart-line"
                  className="flex min-w-0 flex-wrap items-center gap-3 rounded-tile border border-border bg-card px-4 py-3"
                >
                  <span className="flex min-w-40 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {l.productName} · {l.size}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.batchCode} · {l.quantity} × {formatRupees(l.salePrice)}
                      {l.stickering ? ` + ${formatRupees(l.stickering.price)} stickering` : ""}
                    </span>
                  </span>
                  <AreaCard lengthFt={l.lengthFt} breadthFt={l.breadthFt} quantity={l.quantity} />
                  <span className="shrink-0 text-sm font-semibold tabular">
                    {formatRupees(computeMargin(l).revenue)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${l.productName} ${l.batchCode}`}
                    disabled={pending}
                    onClick={() => setCart(removeLine(cart, index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside
        aria-label="Order summary"
        className="rounded-card bg-card p-6 shadow-sm lg:sticky lg:top-6"
        data-testid="order-summary"
      >
        <h2 className="text-base font-bold">Order Summary</h2>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Stone Sale Price" value={formatRupees(figures.stoneTotal)} />
          <Row
            label="Landed Cost (auto)"
            sub="From the batch, freight included"
            value={cart.length > 0 ? formatRupees(figures.landedTotal) : "Add a line"}
            muted
          />
          <Row label="Base Margin" value={formatRupees(figures.stoneMargin)} />
          {cart.some((l) => l.stickering) ? (
            <Row label="Stickering Margin" value={formatRupees(figures.stickeringMargin)} />
          ) : null}
        </dl>
        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Margin</div>
            <div className="text-3xl font-bold tabular" data-testid="total-margin">
              {formatRupees(figures.margin)}
            </div>
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
            {figures.marginPct === null ? "0%" : `${figures.marginPct.toFixed(1)}%`}
          </span>
        </div>
        {error ? (
          <Notice tone="error" icon="alert" className="mt-4">
            {error}
          </Notice>
        ) : null}
        <Button
          type="submit"
          disabled={pending || cart.length === 0 || !customer}
          className="mt-5 h-12 w-full text-base font-semibold"
        >
          {pending ? "Recording..." : cart.length > 1 ? `Record Sale (${cart.length} lines)` : "Record Sale"}
        </Button>
      </aside>

      <SplitDialog
        quantity={split?.quantity ?? null}
        rows={lineBatches.map((b) => ({
          batchId: b.id ?? "",
          batchCode: b.batch_code ?? "",
          available: remaining(b),
        }))}
        onConfirm={confirmSplit}
        onClose={() => setSplit(null)}
        onCloseAutoFocus={returnFocusAfterSplit}
      />

      <CustomerDialog
        draft={newCustomer}
        onClose={() => setNewCustomer(null)}
        onSaved={(c) => {
          setAddedCustomers((prev) => [...prev, c]);
          setCustomerId(c.id);
          setNewCustomer(null);
          afterWrite();
        }}
      />
    </form>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 rounded-card bg-card p-5 shadow-sm">{children}</section>;
}

function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
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
