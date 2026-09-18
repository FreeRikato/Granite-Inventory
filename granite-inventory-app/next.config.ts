import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /* Serve a page revisited within 10s from the client router cache instead of re-rendering it
       on the server. Server actions revalidatePath, so the user's own writes still show at once;
       only another user's writes can lag by up to 10s on a revisit. */
    staleTimes: { dynamic: 10 },
  },
};

export default nextConfig;
