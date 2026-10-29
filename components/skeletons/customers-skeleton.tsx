import { Skeleton } from "@/components/ui/skeleton";
import { DataAgeRowSkeleton, KpiRowSkeleton, SearchSkeleton } from "./parts";

export function CustomersSkeleton() {
  return (
    <div data-skeleton="customers" className="contents">
      <DataAgeRowSkeleton />
      <KpiRowSkeleton count={3} />
      <SearchSkeleton className="max-w-sm" />
      <div className="flex flex-col divide-y divide-border rounded-card bg-card px-6 shadow-sm">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
