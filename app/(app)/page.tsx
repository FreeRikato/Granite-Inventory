import { Suspense } from "react";
import { AskButton } from "@/components/chat/ask-button";
import { AskPanel } from "@/components/chat/ask-panel";
import { AskProvider } from "@/components/chat/ask-provider";
import { PageHeader } from "@/components/shell/page-header";
import { OverviewView } from "./overview-view";

export default function OverviewPage() {
  return (
    <AskProvider>
      <PageHeader title="Overview" actions={<AskButton />} />
      <Suspense>
        <OverviewView />
      </Suspense>
      <AskPanel />
    </AskProvider>
  );
}
