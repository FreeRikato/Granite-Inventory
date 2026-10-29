import type { ReactNode } from "react";

export function ViewSkeleton({ children }: { readonly children: ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      {children}
    </div>
  );
}

export function ViewReady({ children }: { readonly children: ReactNode }) {
  return <div className="flex animate-in flex-col gap-7 fade-in motion-enter">{children}</div>;
}

export function ViewError({ what, message }: { readonly what: string; readonly message: string }) {
  return (
    <p className="py-8 text-center text-sm text-destructive">
      Could not load {what}: {message}
    </p>
  );
}
