import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  readonly label: string;
  readonly htmlFor?: string;
  readonly error?: string;
  readonly hint?: string;
  readonly className?: string;
  readonly children: ReactNode;
};

/* Label above control, error below. Every form field in the app uses this. */
export function Field({ label, htmlFor, error, hint, className, children }: Props) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-stale" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
