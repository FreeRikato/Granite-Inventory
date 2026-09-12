import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const sell = NAV_ITEMS.find((item) => item.href === "/sell");
  if (!sell) throw new Error("Sell navigation item is missing");
  return <PageLoading title={sell.label} />;
}
