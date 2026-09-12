/* Static placeholder shown while a page's server render is in flight, so a tap on the nav
   responds immediately. No animation on purpose. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      <div className="h-8 w-40 rounded-md bg-muted" />
      <div className="h-48 rounded-card bg-card shadow-sm" />
      <div className="h-64 rounded-card bg-card shadow-sm" />
    </div>
  );
}
