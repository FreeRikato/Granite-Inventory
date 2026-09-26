"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setPending(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full text-sm font-semibold"
      onClick={signIn}
      disabled={pending}
    >
      <GoogleMark />
      Continue with Google
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.6 4.1-5.35 4.1-3.2 0-5.8-2.65-5.8-5.9S8.8 6.3 12 6.3c1.85 0 3.05.8 3.75 1.45l2.55-2.45C16.7 3.8 14.55 2.8 12 2.8 6.95 2.8 2.85 6.9 2.85 12S6.95 21.2 12 21.2c5.3 0 8.8-3.7 8.8-8.95 0-.6-.05-1.05-.15-1.15z"
      />
    </svg>
  );
}
