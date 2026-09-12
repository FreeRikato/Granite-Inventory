import { PageLoading } from "@/components/shell/page-loading";
import { NAV_ITEMS } from "@/lib/nav";

export default function Loading() {
  const customers = NAV_ITEMS.find((item) => item.href === "/customers");
  if (!customers) throw new Error("Customers navigation item is missing");
  return <PageLoading title={customers.label} />;
}
