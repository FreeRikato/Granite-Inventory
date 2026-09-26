import type { ReactNode } from "react";
import { CommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  readonly title: string;
  readonly actions?: ReactNode;
};

/* Title row with the palette trigger (desktop), the theme toggle (mobile only, the sidebar
   carries it on desktop) and any page actions on the right. */
export function PageHeader({ title, actions }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight md:text-[26px]">{title}</h1>
      <div className="flex items-center gap-2">
        <CommandPalette />
        <ThemeToggle className="md:hidden" />
        {actions}
      </div>
    </div>
  );
}
