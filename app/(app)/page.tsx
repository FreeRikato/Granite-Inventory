import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { OverviewView } from "./overview-view";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" />
      <Suspense>
        <OverviewView />
      </Suspense>
    </>
  );
}
