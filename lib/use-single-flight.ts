import { useCallback, useRef, useTransition } from "react";

export function useSingleFlight() {
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const run = useCallback((task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        await task();
      } finally {
        inFlight.current = false;
      }
    });
  }, []);
  return [pending, run] as const;
}
