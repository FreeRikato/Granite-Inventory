import { PageLoading } from "@/components/shell/page-loading";
import { CustomerSkeleton } from "@/components/skeletons/customer-skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <CustomerSkeleton />
    </PageLoading>
  );
}
