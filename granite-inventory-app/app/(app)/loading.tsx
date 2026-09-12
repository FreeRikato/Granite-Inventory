import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const overview = NAV_ITEMS.find((item) => item.href === "/");
  if (!overview) throw new Error("Overview navigation item is missing");
  return <PageLoading title={overview.label} />;
}
