import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const AUTH_TIMING_ENABLED = process.env.AUTH_TIMING === "1";

async function getSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const settingsStartedAt = AUTH_TIMING_ENABLED ? performance.now() : 0;
  const { data } = await supabase
    .from("settings")
    .select("business_name")
    .maybeSingle();
  const settingsMs = AUTH_TIMING_ENABLED ? performance.now() - settingsStartedAt : 0;
  return { data, settingsMs };
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (session.status !== "member") redirect("/login");

  const supabase = await createClient();
  const { data: settings, settingsMs } = await getSettings(supabase);

  if (AUTH_TIMING_ENABLED) {
    // Shared layouts are skipped on soft navigations, so this line covers document loads only.
    console.log(`auth-timing ${JSON.stringify({ settingsMs })}`);
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
