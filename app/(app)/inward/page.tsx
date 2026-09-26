import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { InwardView } from "./inward-view";

/* A static shell: the lists and recent batches come from the browser cache. */
export default function InwardPage() {
  return (
    <>
      <PageHeader title="Inward Stock" />
      <Suspense>
        <InwardView />
      </Suspense>
    </>
  );
}
