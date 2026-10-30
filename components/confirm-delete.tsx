"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  readonly title: string;
  readonly description: string;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly label?: string;
  readonly iconLabel?: string;
};

export function ConfirmDelete({
  title,
  description,
  onConfirm,
  disabled,
  pending,
  label = "Delete",
  iconLabel,
}: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {iconLabel ? (
          <Button variant="ghost" size="icon" className="size-8 text-stale" disabled={disabled} aria-label={iconLabel}>
            <Icon pending={pending} />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-9 bg-card text-stale" disabled={disabled}>
            <Icon pending={pending} /> {label}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Icon({ pending }: { readonly pending?: boolean }) {
  return pending ? <Spinner aria-hidden /> : <Trash2 className="size-4" />;
}
