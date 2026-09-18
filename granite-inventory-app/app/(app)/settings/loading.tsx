import { PageLoading } from "@/components/shell/page-loading";
import { SETTINGS_ITEM } from "@/lib/nav";

export default function Loading() {
  return <PageLoading title={SETTINGS_ITEM.label} />;
}
