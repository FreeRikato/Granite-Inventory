import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, KpiRowSkeleton, TitleSkeleton } from "./parts";

export function CustomerSkeleton() {
  return (
    <div data-skeleton="customer" className="contents">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <KpiRowSkeleton count={3} />
      <CardSkeleton>
        <TitleSkeleton className="w-16" />
        <div className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </CardSkeleton>
    </div>
  );
}
