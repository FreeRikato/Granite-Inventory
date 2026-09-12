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

const PHONE_KEYWORD_PREFIX = "__phone_digits__:";

export function searchOptionMatches(option: SearchOption, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  if (option.label.toLowerCase().includes(trimmed.toLowerCase())) return true;

  const phoneQuery = phoneDigits(trimmed);
  const optionPhoneDigits = phoneDigits(option.phone ?? "");
  return phoneQuery.length > 0 && optionPhoneDigits.includes(phoneQuery);
}

export function searchOptionHasMatch(option: SearchOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (option.label.toLowerCase() === normalizedQuery) return true;

  const queryPhoneDigits = phoneDigits(query);
  return queryPhoneDigits.length > 0 && phoneDigits(option.phone ?? "") === queryPhoneDigits;
}

function commandFilter(value: string, search: string, keywords?: readonly string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  if (value.toLowerCase().includes(query)) return 1;

  const phoneQuery = phoneDigits(search);
  const phoneMatches = phoneQuery.length > 0 && (keywords ?? []).some(
    (keyword) => keyword.startsWith(PHONE_KEYWORD_PREFIX) && keyword.slice(PHONE_KEYWORD_PREFIX.length).includes(phoneQuery),
  );
  if (phoneMatches) return 1;

  return (keywords ?? []).some((keyword) => !keyword.startsWith(PHONE_KEYWORD_PREFIX) && keyword.toLowerCase().includes(query)) ? 1 : 0;
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
  const hasMatch = options.some((option) => searchOptionHasMatch(option, trimmed));

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
              {options.map((option) => {
                const optionPhoneDigits = phoneDigits(option.phone ?? "");
                const keywords = [
                  ...(option.keywords ?? []),
                  ...(optionPhoneDigits ? [`${PHONE_KEYWORD_PREFIX}${optionPhoneDigits}`] : []),
                ];
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={keywords.length > 0 ? keywords : undefined}
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
                );
              })}
              {onCreate && trimmed && !hasMatch ? (
                <CommandItem
                  value={`__create__${trimmed}`}
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
