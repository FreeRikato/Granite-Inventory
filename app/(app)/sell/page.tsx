import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { SellSkeleton } from "@/components/skeletons/sell-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { SellView } from "./sell-view";

const skeleton = (
  <ViewSkeleton>
    <SellSkeleton />
  </ViewSkeleton>
);

export default function SellPage() {
  return (
    <>
      <PageHeader title="Sell Stone" />
      <Suspense fallback={skeleton}>
        <SellView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
