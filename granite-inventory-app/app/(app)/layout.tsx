import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MemberProvider } from "@/components/shell/member-provider";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { getSession } from "@/lib/auth";
import { QueryProvider } from "@/lib/query/provider";
import { createClient } from "@/lib/supabase/server";

async function getBusinessName(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("business_name").maybeSingle();
  return data?.business_name ?? null;
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Both reads run as the signed-in user, so a non-member's settings read returns null under RLS
  // and nothing renders before the redirect. Running them at once makes a hard load pay for the
  // slower of the two instead of their sum.
  const [session, businessName] = await Promise.all([getSession(), getBusinessName()]);
  if (session.status !== "member") redirect("/login");

  return (
    <MemberProvider member={session.member}>
      <QueryProvider cacheKey={session.member.email}>
        <div className="flex min-h-svh bg-background">
          <AppSidebar businessName={businessName ?? "Granite"} member={session.member} />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-12 md:pb-12 md:pt-10">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-7">{children}</div>
          </main>
          <MobileTabBar />
        </div>
      </QueryProvider>
    </MemberProvider>
  );
}
