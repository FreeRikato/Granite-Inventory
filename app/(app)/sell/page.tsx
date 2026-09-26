import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { SellView } from "./sell-view";

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
