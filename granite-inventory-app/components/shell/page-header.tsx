import type { ReactNode } from "react";

type Props = {
  readonly title: string;
  readonly actions?: ReactNode;
};

export function PageHeader({ title, actions }: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight md:text-[26px]">{title}</h1>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
