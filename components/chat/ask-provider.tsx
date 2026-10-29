"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Ask = { readonly open: boolean; readonly toggle: () => void; readonly close: () => void };

const AskContext = createContext<Ask | null>(null);

export function AskProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AskContext.Provider value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}>
      {children}
    </AskContext.Provider>
  );
}

export function useAsk(): Ask {
  const ask = useContext(AskContext);
  if (!ask) throw new Error("useAsk must be used inside AskProvider");
  return ask;
}
