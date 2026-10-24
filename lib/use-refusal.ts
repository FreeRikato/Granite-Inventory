import { useState } from "react";

export function useRefusal(values: unknown) {
  const snapshot = JSON.stringify(values);
  const [refusal, setRefusal] = useState<{ message: string; snapshot: string } | null>(null);
  return {
    error: refusal && refusal.snapshot === snapshot ? refusal.message : null,
    refuse: (message: string) => setRefusal({ message, snapshot }),
    clear: () => setRefusal(null),
  };
}
