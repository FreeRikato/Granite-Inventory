import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, TitleSkeleton } from "./parts";

function ChartCardSkeleton({ chart }: { readonly chart: string }) {
  return (
    <CardSkeleton>
      <TitleSkeleton />
      <Skeleton className={`mt-4 ${chart}`} />
    </CardSkeleton>
  );
}

export function OverviewSkeleton() {
  return (
    <div data-skeleton="overview" className="contents">
      <DataAgeRowSkeleton />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <CardSkeleton className="grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-12 w-36" />
            </div>
          ))}
        </CardSkeleton>
        <CardSkeleton className="flex flex-col divide-y divide-border py-0">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="py-5">
              <Skeleton className="h-14" />
            </div>
          ))}
        </CardSkeleton>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChartCardSkeleton chart="h-[184px] md:h-[264px]" />
        <ChartCardSkeleton chart="h-[184px] md:h-[264px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-[400px_minmax(0,1fr)]">
        <ChartCardSkeleton chart="h-28 md:h-[150px]" />
        <ChartCardSkeleton chart="h-28 md:h-[150px]" />
      </div>
      <Skeleton className="h-36 rounded-card" />
    </div>
  );
}
