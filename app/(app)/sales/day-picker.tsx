"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayHref, isViewableDay, shiftDay } from "@/lib/daily-sales";

export function DayPicker({ day, today }: { readonly day: string; readonly today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ day, value: day });
  const value = draft.day === day ? draft.value : day;

  function step(to: string) {
    router.push(dayHref(to, today), { scroll: false });
  }

  function type(typed: string) {
    setDraft({ day, value: typed });
    if (isViewableDay(typed, today)) router.replace(dayHref(typed, today), { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="day-picker">
      <Button
        variant="outline"
        size="icon-lg"
        className="bg-card"
        aria-label="Previous day"
        onClick={() => step(shiftDay(day, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Input
        type="date"
        aria-label="Day"
        className="h-9 w-40 bg-card"
        min="2000-01-01"
        max={today}
        value={value}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setDraft({ day, value: day })}
      />
      <Button
        variant="outline"
        size="icon-lg"
        className="bg-card"
        aria-label="Next day"
        disabled={day >= today}
        onClick={() => step(shiftDay(day, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      {day === today ? null : (
        <Button variant="ghost" size="lg" onClick={() => step(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
