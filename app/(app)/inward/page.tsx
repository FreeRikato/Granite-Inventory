import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { InwardSkeleton } from "@/components/skeletons/inward-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { InwardView } from "./inward-view";

const skeleton = (
  <ViewSkeleton>
    <InwardSkeleton />
  </ViewSkeleton>
);

export default function InwardPage() {
  return (
    <>
      <PageHeader title="Inward Stock" />
      <Suspense fallback={skeleton}>
        <InwardView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
