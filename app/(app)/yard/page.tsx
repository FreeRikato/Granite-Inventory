import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { YardView } from "./yard-view";

/* A static shell: no server data and no searchParams here, so the router prefetches it and a
   sidebar click paints without a server round trip. The rows come from the browser cache. */
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
