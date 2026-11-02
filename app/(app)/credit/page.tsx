import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { CreditSkeleton } from "@/components/skeletons/credit-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { CreditView } from "./credit-view";

const skeleton = (
  <ViewSkeleton>
    <CreditSkeleton />
  </ViewSkeleton>
);

export default function CreditPage() {
  return (
    <>
      <PageHeader title="Credit" />
      <Suspense fallback={skeleton}>
        <CreditView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
