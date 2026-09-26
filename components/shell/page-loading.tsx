import { NAV_ITEMS } from "@/lib/nav";

type Props = {
  readonly title?: string;
  readonly href?: string;
};

/* Static placeholder shown while a page's server render is in flight, so a tap on the nav responds immediately.
   No animation on purpose; the title is aria-hidden so heading-based readiness signals and screen readers are unaffected. */
export function PageLoading({ href, title }: Props) {
  const resolvedTitle = title ?? NAV_ITEMS.find((item) => item.href === href)?.label;

  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      {resolvedTitle ? (
        <div aria-hidden="true" className="text-2xl font-bold tracking-tight md:text-[26px]">
          {resolvedTitle}
        </div>
      ) : (
        <div className="h-8 w-40 rounded-md bg-muted" />
      )}
      <div className="h-48 rounded-card bg-card shadow-sm" />
      <div className="h-64 rounded-card bg-card shadow-sm" />
    </div>
  );
}
