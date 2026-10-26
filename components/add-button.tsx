import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
};

export function AddButton({ label, onClick, disabled }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 shrink-0 bg-card px-3 font-semibold"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="size-4" /> Add
    </Button>
  );
}
