import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { YardView } from "./yard-view";

export default function YardPage() {
  return (
    <>
      <PageHeader title="Yard Slots" />
      <Suspense>
        <YardView />
      </Suspense>
    </>
  );
}
