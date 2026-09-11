"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateSettingsAction } from "./actions";

type Props = { readonly ageing: number; readonly stale: number };

const PRESETS = [90, 180, 365] as const;

export function InventoryRules({ ageing, stale }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ ageing: String(ageing), stale: String(stale) });
  const a = Number.parseInt(form.ageing, 10);
  const s = Number.parseInt(form.stale, 10);
  const dirty = form.ageing !== String(ageing) || form.stale !== String(stale);

  function save() {
    startTransition(async () => {
      const result = await updateSettingsAction({ ageingAfterDays: form.ageing, staleAfterDays: form.stale });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Inventory rules saved");
      router.refresh();
    });
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Inventory rules</h2>
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Stale stock threshold</h3>
        <p className="text-sm text-muted-foreground">Batches older than this are flagged for discount or promotion.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Stale after">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={s === p}
              onClick={() => setForm({ ageing: String(Math.min(a || 1, Math.floor(p / 2))), stale: String(p) })}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                s === p ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {p} days
            </button>
          ))}
        </div>
        <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
          <Field label="Ageing after (days)" htmlFor="ageing">
            <Input id="ageing" type="number" min="1" step="1" value={form.ageing}  onChange={(e) => setForm({ ...form, ageing: e.target.value })} />
          </Field>
          <Field label="Stale after (days)" htmlFor="stale" error={Number.isFinite(a) && Number.isFinite(s) && a >= s ? "Must be after ageing" : undefined}>
            <Input id="stale" type="number" min="2" step="1" value={form.stale}  onChange={(e) => setForm({ ...form, stale: e.target.value })} />
          </Field>
        </div>
        <Button className="mt-3" disabled={pending || !dirty || !(a < s)} onClick={save}>Save rules</Button>
      </div>
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Ageing colours</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          <Band color="bg-fresh" label="Fresh" text={`0 to ${(Number.isFinite(a) ? a : ageing) - 1} days`} />
          <Band color="bg-ageing" label="Ageing" text={`${Number.isFinite(a) ? a : ageing} to ${(Number.isFinite(s) ? s : stale) - 1} days`} />
          <Band color="bg-stale" label="Stale" text={`${Number.isFinite(s) ? s : stale} days and over`} />
        </ul>
      </div>
    </section>
  );
}

function Band({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-2.5 rounded-sm", color)} aria-hidden />
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}
