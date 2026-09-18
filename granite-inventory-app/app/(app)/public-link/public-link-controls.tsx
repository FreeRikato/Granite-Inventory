"use client";

import { useState, useTransition } from "react";
import { useAfterWrite } from "@/lib/query/provider";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { updateSettingsAction } from "@/app/(app)/settings/actions";

type Props = {
  readonly url: string;
  readonly catalogPublic: boolean;
  readonly whatsappNumber: string;
  readonly businessName: string;
  readonly canEdit: boolean;
};

export function PublicLinkControls({ url, catalogPublic, whatsappNumber, businessName, canEdit }: Props) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [number, setNumber] = useState(whatsappNumber);
  const testLink = whatsappLink(number, `Hi ${businessName}, testing the catalog button.`);

  function save(patch: { catalogPublic?: boolean; whatsappNumber?: string }) {
    startTransition(async () => {
      const result = await updateSettingsAction(patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(patch.catalogPublic === undefined ? "WhatsApp number saved" : patch.catalogPublic ? "Catalog is live" : "Catalog switched off");
      afterWrite();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Your public catalog</h2>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={url} className="h-11 bg-muted font-mono text-sm" aria-label="Catalog URL" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" className="h-11 bg-card" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy Link"}
        </Button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Switch
          checked={catalogPublic}
          disabled={!canEdit || pending}
          onCheckedChange={(c) => save({ catalogPublic: c })}
          aria-label="Catalog is live"
        />
        <span className="text-sm">Catalog is live</span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", catalogPublic ? "text-fresh" : "text-muted-foreground")} data-testid="catalog-status">
          <span className={cn("size-1.5 rounded-full", catalogPublic ? "bg-fresh" : "bg-muted-foreground")} />
          {catalogPublic ? "Live" : "Off"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="WhatsApp number for inquiries" htmlFor="whatsapp" hint="Visitors tap Call to Inquire and land in this chat. Indian numbers may omit +91.">
          <Input id="whatsapp" inputMode="tel" placeholder="+91 98765 43210" value={number} onChange={(e) => setNumber(e.target.value)} disabled={!canEdit} className="h-11" />
        </Field>
        <div className="flex gap-2">
          <Button type="button" disabled={!canEdit || pending || number === whatsappNumber} onClick={() => save({ whatsappNumber: number })}>
            Save number
          </Button>
          {testLink ? (
            <Button asChild variant="outline" className="bg-card">
              <a href={testLink} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> Test</a>
            </Button>
          ) : null}
        </div>
      </div>
      {!canEdit ? <p className="mt-3 text-xs text-muted-foreground">Only an Admin can switch the catalog or change the number.</p> : null}
    </section>
  );
}
