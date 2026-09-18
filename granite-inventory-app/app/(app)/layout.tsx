import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MemberProvider } from "@/components/shell/member-provider";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { getSession } from "@/lib/auth";
import { QueryProvider } from "@/lib/query/provider";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (session.status !== "member") redirect("/login");

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("business_name")
    .maybeSingle();

  return (
    <MemberProvider member={session.member}>
      <QueryProvider cacheKey={session.member.email}>
        <div className="flex min-h-svh bg-background">
          <AppSidebar businessName={settings?.business_name ?? "Granite"} member={session.member} />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-12 md:pb-12 md:pt-10">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-7">{children}</div>
          </main>
          <MobileTabBar />
        </div>
      </QueryProvider>
    </MemberProvider>
  );
}
