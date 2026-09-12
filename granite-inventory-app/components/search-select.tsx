"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { phoneDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type SearchOption = {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly phone?: string | null;
  readonly keywords?: readonly string[];
};

const CREATE_VALUE_PREFIX = "__create__";

/* The one matching rule for the list: case-insensitive substring of the label or a keyword,
   or a digit-substring of the phone. Both the list filter and the seam tests go through it. */
export function searchOptionMatches(option: SearchOption, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const normalizedQuery = trimmed.toLowerCase();
  if (option.label.toLowerCase().includes(normalizedQuery)) return true;
  if ((option.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(normalizedQuery))) return true;

  const phoneQuery = phoneDigits(trimmed);
  return phoneQuery.length > 0 && phoneDigits(option.phone ?? "").includes(phoneQuery);
}

/* Exact label or exact phone digits. Decides whether the "Add ..." row is offered: a query that
   only partially matches an option must still be creatable. */
export function searchOptionIsExact(option: SearchOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (option.label.toLowerCase() === normalizedQuery) return true;

  const queryPhoneDigits = phoneDigits(query);
  return queryPhoneDigits.length > 0 && phoneDigits(option.phone ?? "") === queryPhoneDigits;
}

type Props = {
  readonly options: readonly SearchOption[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  /* When given, an "Add ..." row appears for a query that matches nothing. */
  readonly onCreate?: (query: string) => void;
  readonly createLabel?: (query: string) => string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
};

/* Searchable single select with optional inline create, built from Popover + Command. */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "Nothing found.",
  onCreate,
  createLabel = (q) => `Add "${q}"`,
  disabled,
  id,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const trimmed = query.trim();
  const hasExactMatch = options.some((option) => searchOptionIsExact(option, trimmed));
  const optionsByValue = new Map(options.map((option) => [option.value, option]));
  /* cmdk hands the filter an item's value, so items carry the option id and the rule looks
     the option up. The create row is never filtered out. */
  const commandFilter = (value: string, search: string): number => {
    if (value.startsWith(CREATE_VALUE_PREFIX)) return 1;
    const option = optionsByValue.get(value);
    return option !== undefined && searchOptionMatches(option, search) ? 1 : 0;
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between bg-card px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={commandFilter}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </span>
                  <Check className={cn("ml-auto size-4", value === option.value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
              {onCreate && trimmed && !hasExactMatch ? (
                <CommandItem
                  value={`${CREATE_VALUE_PREFIX}${trimmed}`}
                  onSelect={() => {
                    onCreate(trimmed);
                    setOpen(false);
                  }}
                  className="text-primary"
                >
                  <Plus className="size-4" />
                  {createLabel(trimmed)}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
