import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { SellView } from "./sell-view";

/* A static shell, like Yard: the customers, stock lines and batches come from the browser cache. */
export default function SellPage() {
  return (
    <>
      <PageHeader title="Sell Stone" />
      <Suspense>
        <SellView />
      </Suspense>
    </>
  );
}
