/* NEXT_PUBLIC_ values must be referenced literally so Next can inline them for the browser. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
if (!supabasePublishableKey) {
  throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const env = { supabaseUrl, supabasePublishableKey } as const;
