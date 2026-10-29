import { PageLoading } from "@/components/shell/page-loading";
import { InwardSkeleton } from "@/components/skeletons/inward-skeleton";

export default function Loading() {
  return (
    <PageLoading href="/inward">
      <InwardSkeleton />
    </PageLoading>
  );
}
