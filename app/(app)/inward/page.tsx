import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { InwardView } from "./inward-view";

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
