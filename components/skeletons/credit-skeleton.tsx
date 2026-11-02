import { Skeleton } from "@/components/ui/skeleton";
import { DataAgeRowSkeleton, KpiRowSkeleton, SearchSkeleton } from "./parts";

export function CreditSkeleton() {
  return (
    <div data-skeleton="credit" className="contents">
      <DataAgeRowSkeleton />
      <KpiRowSkeleton count={3} />
      <SearchSkeleton className="max-w-sm" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
    </div>
  );
}
