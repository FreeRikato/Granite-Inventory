export type RowState = "idle" | "pending" | "leaving";

export const EXIT_MS = 150;

export const rowStateClass =
  "transition-opacity duration-(--motion-fast) ease-(--motion-ease-out) has-[[data-row-state=pending]]:opacity-40 has-[[data-row-state=leaving]]:opacity-0";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
