import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MemberProvider } from "@/components/shell/member-provider";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { OfflineNotice } from "@/components/shell/offline-notice";
import { getSession } from "@/lib/auth";
import { QueryProvider } from "@/lib/query/provider";
import { createClient } from "@/lib/supabase/server";

export const viewport: Viewport = { interactiveWidget: "resizes-content" };

async function getBusinessName(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("business_name").maybeSingle();
  return data?.business_name ?? null;
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, businessName] = await Promise.all([getSession(), getBusinessName()]);
  if (session.status !== "member") redirect("/login");

  return (
    <MemberProvider member={session.member}>
      <QueryProvider cacheKey={session.member.email}>
        <OfflineNotice />
        <div className="flex min-h-svh bg-background">
          <AppSidebar businessName={businessName ?? "Granite"} member={session.member} />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-12 md:pb-12 md:pt-10 xl:has-[[data-ask-open]]:pr-[calc(380px+1.5rem)]">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-7">{children}</div>
          </main>
          <MobileTabBar />
        </div>
      </QueryProvider>
    </MemberProvider>
  );
}
