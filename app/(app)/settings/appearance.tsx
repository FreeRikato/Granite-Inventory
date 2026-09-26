import { ThemeToggle } from "@/components/theme-toggle";
import { TintSelect } from "@/components/tint-select";

export function Appearance() {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Appearance</h2>
      <p className="text-sm text-muted-foreground">Applies to this device only.</p>
      <div className="mt-4 flex flex-wrap gap-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Tint</span>
          <TintSelect />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Dark mode</span>
          <ThemeToggle className="size-10" />
        </div>
      </div>
    </section>
  );
}
