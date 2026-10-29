"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messageOf, type ActionResult } from "@/lib/action-result";
import { useAfterWrite } from "./provider";
import type { Write } from "./writes";
import { EXIT_MS, wait, type RowState } from "./row-style";

export function RowMark({ state }: { readonly state: RowState }) {
  return <span hidden data-row-state={state} />;
}

export function useRowRemoval(write: Write) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const state: RowState = leaving ? "leaving" : pending ? "pending" : "idle";

  function remove(action: () => Promise<ActionResult<unknown>>, message: string, onRemoved: () => void) {
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = await action();
      } catch (error) {
        toast.error(messageOf(error));
        afterWrite(write);
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      setLeaving(true);
      await wait(EXIT_MS);
      onRemoved();
    });
  }

  return { state, pending, remove };
}
