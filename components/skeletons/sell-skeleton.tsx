import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, FieldSkeleton } from "./parts";

export function SellSkeleton() {
  return (
    <div data-skeleton="sell" className="contents">
      <DataAgeRowSkeleton />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <CardSkeleton className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </CardSkeleton>
          <Skeleton className="h-72 rounded-card" />
          <CardSkeleton className="grid gap-4 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </CardSkeleton>
          <Skeleton className="h-16 rounded-card" />
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}
