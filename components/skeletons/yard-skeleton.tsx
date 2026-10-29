import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, DataAgeRowSkeleton, SearchSkeleton, TitleSkeleton } from "./parts";

const FILTER_WIDTHS = ["w-28", "w-28", "w-28", "w-28", "w-28", "w-44", "w-36"];

export function YardSkeleton() {
  return (
    <div data-skeleton="yard" className="contents">
      <div className="flex flex-wrap items-center gap-2">
        <SearchSkeleton className="min-w-[220px] flex-1" />
        {FILTER_WIDTHS.map((width, i) => (
          <SearchSkeleton key={i} className={width} />
        ))}
      </div>
      <DataAgeRowSkeleton />
      {Array.from({ length: 3 }, (_, i) => (
        <CardSkeleton key={i} className="bg-card/60 p-4 ring-1 ring-border md:p-6">
          <TitleSkeleton className="mb-4 w-24" />
          <Skeleton className="h-28" />
          <Skeleton className="mt-3 h-28" />
        </CardSkeleton>
      ))}
    </div>
  );
}
