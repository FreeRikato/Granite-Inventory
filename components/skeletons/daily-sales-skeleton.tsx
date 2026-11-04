import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, LineSkeleton, TitleSkeleton } from "./parts";

export function DailySalesSkeleton() {
  return (
    <div data-skeleton="sales" className="contents">
      <DataAgeRowSkeleton />
      <Skeleton className="h-9 w-62" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1.5fr_1fr] xl:gap-x-0 xl:divide-x xl:divide-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1 xl:pr-4 xl:pl-4 xl:first:pl-0">
            <Skeleton className="h-5 w-24 max-w-full" />
            <Skeleton className="h-8 w-20 max-w-full" />
          </div>
        ))}
      </div>
      <CardSkeleton className="flex flex-col gap-3">
        <TitleSkeleton />
        {Array.from({ length: 4 }, (_, i) => (
          <LineSkeleton key={i} />
        ))}
      </CardSkeleton>
    </div>
  );
}
