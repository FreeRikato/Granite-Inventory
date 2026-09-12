"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { initialsOf } from "@/components/customer-type-badge";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/lib/database.types";
import { ROLE_LABEL, ROLES, isRole, type Role } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { addMemberAction, removeMemberAction, setMemberRoleAction } from "./actions";

type Props = {
  readonly members: readonly Tables<"team_members">[];
  readonly currentEmail: string;
};

export function TeamAccess({ members, currentEmail }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ email: string; name: string; role: Role }>({ email: "", name: "", role: "YARD_OPERATOR" });

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      setOpen(false);
      setDraft({ email: "", name: "", role: "YARD_OPERATOR" });
      router.refresh();
    });
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Team &amp; access</h2>
      <p className="text-sm text-muted-foreground">Only these Google accounts can sign in.</p>
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {members.map((m) => {
          const me = m.email === currentEmail;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="member-row">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", m.role === "ADMIN" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                {initialsOf(m.name ?? m.email)}
              </span>
              <span className="flex min-w-0 flex-1 basis-[calc(100%-3rem)] flex-col sm:basis-auto">
                <span className="truncate text-sm font-semibold">{m.name ?? m.email}{me ? " (you)" : ""}</span>
                <span className="truncate text-xs text-muted-foreground">{m.email}</span>
              </span>
              {!me ? (
                <span className="flex w-full flex-wrap gap-3 pl-12 sm:w-auto sm:flex-nowrap sm:pl-0">
                  <Select value={m.role} onValueChange={(v) => { if (isRole(v)) run(() => setMemberRoleAction(m.id, v), "Role updated"); }}>
                    <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Role for ${m.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <ConfirmDelete
                    title={`Remove ${m.email}?`}
                    description="They will lose access on their next request. You can add them back any time."
                    onConfirm={() => run(() => removeMemberAction(m.id), "Member removed")}
                    disabled={pending}
                    label="Remove"
                  />
                </span>
              ) : (
                <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide", m.role === "ADMIN" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {ROLE_LABEL[isRole(m.role) ? m.role : "YARD_OPERATOR"]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="outline" className="mt-4 bg-card" onClick={() => setOpen(true)}>
            <UserPlus className="size-4" /> Invite a Google account
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite a Google account</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4">
                <Field label="Google email" htmlFor="tm-email" hint="They sign in with this Google account. No email is sent.">
                  <Input id="tm-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} autoFocus />
                </Field>
                <Field label="Name" htmlFor="tm-name">
                  <Input id="tm-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Role" htmlFor="tm-role">
                  <Select value={draft.role} onValueChange={(v) => { if (isRole(v)) setDraft({ ...draft, role: v }); }}>
                    <SelectTrigger id="tm-role" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button disabled={pending || !draft.email} onClick={() => run(() => addMemberAction(draft), `${draft.email} can now sign in`)}>Add member</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
    </section>
  );
}
