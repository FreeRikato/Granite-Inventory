import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const inward = NAV_ITEMS.find((item) => item.href === "/inward");
  if (!inward) throw new Error("Inward navigation item is missing");
  return <PageLoading title={inward.label} />;
}
