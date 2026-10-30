import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, FieldSkeleton, TitleSkeleton } from "./parts";

export function InwardSkeleton() {
  return (
    <div data-skeleton="inward" className="contents">
      <DataAgeRowSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <CardSkeleton className="md:p-8">
          <TitleSkeleton className="w-40" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 10 }, (_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="mt-6 ml-auto h-11 w-40" />
        </CardSkeleton>
        <Skeleton className="h-24 rounded-card" />
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
