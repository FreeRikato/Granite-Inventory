/* Shared skeleton and error line for pages whose rows come from the browser cache. */

export function ViewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      <div className="h-48 rounded-card bg-card shadow-sm" />
      <div className="h-64 rounded-card bg-card shadow-sm" />
    </div>
  );
}

export function ViewError({ what, message }: { readonly what: string; readonly message: string }) {
  return (
    <p className="py-8 text-center text-sm text-destructive">
      Could not load {what}: {message}
    </p>
  );
}
