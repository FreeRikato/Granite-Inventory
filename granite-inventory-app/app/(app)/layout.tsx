import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { authTimingNow, getAuthTiming, getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const timing = getAuthTiming();
  const session = await getSession();
  if (session.status !== "member") redirect("/login");

  const supabase = await createClient();
  const settingsStartedAt = authTimingNow();
  const { data: settings } = await supabase
    .from("settings")
    .select("business_name")
    .maybeSingle();
  timing.settingsMs = authTimingNow() - settingsStartedAt;

  if (process.env.AUTH_TIMING === "1") {
    const path = (await headers()).get("x-invoke-path") ?? "";
    console.log(
      `auth-timing ${JSON.stringify({
        path,
        claimsMs: timing.claimsMs,
        memberMs: timing.memberMs,
        settingsMs: timing.settingsMs,
      })}`,
    );
  }

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar businessName={settings?.business_name ?? "Granite"} member={session.member} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-12 md:pb-12 md:pt-10">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-7">{children}</div>
      </main>
      <MobileTabBar />
    </div>
  );
}
