import { Suspense } from "react";
import { AskButton } from "@/components/chat/ask-button";
import { AskPanel } from "@/components/chat/ask-panel";
import { AskProvider } from "@/components/chat/ask-provider";
import { PageHeader } from "@/components/shell/page-header";
import { OverviewSkeleton } from "@/components/skeletons/overview-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { OverviewView } from "./overview-view";

const skeleton = (
  <ViewSkeleton>
    <OverviewSkeleton />
  </ViewSkeleton>
);

export default function OverviewPage() {
  return (
    <AskProvider>
      <PageHeader title="Overview" actions={<AskButton />} />
      <Suspense fallback={skeleton}>
        <OverviewView skeleton={skeleton} />
      </Suspense>
      <AskPanel />
    </AskProvider>
  );
}
