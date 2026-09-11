import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kirthik Granite",
    short_name: "Granite",
    description: "Batch-tracked granite yard inventory",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f3",
    theme_color: "#c1592f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
