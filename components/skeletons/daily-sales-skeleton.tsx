import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, KpiRowSkeleton, LineSkeleton, TitleSkeleton } from "./parts";

export function DailySalesSkeleton() {
  return (
    <div data-skeleton="sales" className="contents">
      <DataAgeRowSkeleton />
      <Skeleton className="h-9 w-64" />
      <KpiRowSkeleton count={4} />
      <CardSkeleton className="flex flex-col gap-3">
        <TitleSkeleton />
        {Array.from({ length: 4 }, (_, i) => (
          <LineSkeleton key={i} />
        ))}
      </CardSkeleton>
    </div>
  );
}
