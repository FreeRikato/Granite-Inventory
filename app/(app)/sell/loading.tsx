import { PageLoading } from "@/components/shell/page-loading";
import { SellSkeleton } from "@/components/skeletons/sell-skeleton";

export default function Loading() {
  return (
    <PageLoading href="/sell">
      <SellSkeleton />
    </PageLoading>
  );
}
