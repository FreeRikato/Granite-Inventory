import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const publicLink = NAV_ITEMS.find((item) => item.href === "/public-link");
  if (!publicLink) throw new Error("Public catalog navigation item is missing");
  return <PageLoading title={publicLink.label} />;
}
