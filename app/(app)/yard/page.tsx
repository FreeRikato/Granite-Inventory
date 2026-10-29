import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { YardSkeleton } from "@/components/skeletons/yard-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { YardView } from "./yard-view";

const skeleton = (
  <ViewSkeleton>
    <YardSkeleton />
  </ViewSkeleton>
);

export default function YardPage() {
  return (
    <>
      <PageHeader title="Yard Slots" />
      <Suspense fallback={skeleton}>
        <YardView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
