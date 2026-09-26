import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { OverviewView } from "./overview-view";

/* A static shell like Yard and Sell: the numbers come from the browser cache. */
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
