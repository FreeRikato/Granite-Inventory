import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DataAgeRowSkeleton() {
  return <div className="-mt-4 h-4" />;
}

export function CardSkeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card bg-card p-6 shadow-sm", className)} {...props} />;
}

export function LineSkeleton({ className }: { readonly className?: string }) {
  return <Skeleton className={cn("h-4", className)} />;
}

export function TitleSkeleton({ className }: { readonly className?: string }) {
  return (
    <div className="flex h-6 items-center">
      <Skeleton className={cn("h-4 w-28", className)} />
    </div>
  );
}

export function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-11" />
    </div>
  );
}

export function SearchSkeleton({ className }: { readonly className?: string }) {
  return <Skeleton className={cn("h-10 rounded-full", className)} />;
}

export function KpiRowSkeleton({ count }: { readonly count: number }) {
  return (
    <div className="flex divide-x divide-border">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1 pr-6 pl-6 first:pl-0">
          <Skeleton className="h-5 w-24 max-w-full" />
          <Skeleton className="h-8 w-20 max-w-full" />
        </div>
      ))}
    </div>
  );
}
