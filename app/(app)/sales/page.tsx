import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DailySalesSkeleton } from "@/components/skeletons/daily-sales-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { SalesView } from "./sales-view";

const skeleton = (
  <ViewSkeleton>
    <DailySalesSkeleton />
  </ViewSkeleton>
);

export default function SalesPage() {
  return (
    <>
      <PageHeader title="Daily Sales" />
      <Suspense fallback={skeleton}>
        <SalesView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
