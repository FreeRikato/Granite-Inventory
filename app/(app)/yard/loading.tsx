import { PageLoading } from "@/components/shell/page-loading";
import { YardSkeleton } from "@/components/skeletons/yard-skeleton";

export default function Loading() {
  return (
    <PageLoading href="/yard">
      <YardSkeleton />
    </PageLoading>
  );
}
