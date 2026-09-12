import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const yard = NAV_ITEMS.find((item) => item.href === "/yard");
  if (!yard) throw new Error("Yard navigation item is missing");
  return <PageLoading title={yard.label} />;
}
