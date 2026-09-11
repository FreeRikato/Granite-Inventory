import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GoogleSignInButton } from "./google-sign-in-button";

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await getSession();
  if (session.status === "member") redirect("/");

  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("v_public_business")
    .select("business_name, tagline")
    .maybeSingle();

  const name = business?.business_name ?? "Granite Inventory";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
          {name.charAt(0)}
        </div>
        <h1 className="text-lg font-bold">{name}</h1>
        {business?.tagline ? (
          <p className="text-sm text-muted-foreground">{business.tagline}</p>
        ) : null}
      </div>

      <div className="mt-8 w-full max-w-[420px] rounded-card bg-card p-8 shadow-sm">
        <h2 className="text-xl font-bold">Sign in</h2>
        <p className="mt-3 text-sm text-muted-foreground">Use your Google account to continue.</p>
        <div className="mt-5">
          <GoogleSignInButton />
        </div>
        {session.status === "not-member" ? (
          <p className="mt-4 rounded-md bg-stale-soft px-3 py-2 text-center text-xs text-stale">
            {session.email} is not an approved team member. Ask the owner to add you, or sign
            out and try another account.
          </p>
        ) : null}
        {searchParams.error === "auth" ? (
          <p className="mt-4 text-center text-xs text-stale">Sign-in failed. Please try again.</p>
        ) : null}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access is limited to approved team members.
        </p>
        {session.status === "not-member" ? (
          <form action="/auth/signout" method="post" className="mt-3 text-center">
            <button type="submit" className="text-xs text-primary underline">
              Sign out
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to the Terms of Use and Privacy Policy.
      </p>
    </main>
  );
}
