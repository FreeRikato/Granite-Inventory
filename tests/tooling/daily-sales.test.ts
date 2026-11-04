import { describe, expect, it } from "vitest";
import { dayFromParam, dayHref, isViewableDay, shiftDay } from "@/lib/daily-sales";
import { istToday } from "@/lib/format";

const TODAY = "2026-11-04";

describe("daily sales days", () => {
  it("opens on today without a date and on the date in the URL otherwise", () => {
    expect(dayFromParam(null, TODAY)).toBe(TODAY);
    expect(dayFromParam("2026-10-31", TODAY)).toBe("2026-10-31");
  });

  it.each(["2026-11-05", "2026-02-30", "yesterday", "", "1999-12-31", "0002-10-31"])(
    "falls back to today for %s",
    (param) => {
      expect(dayFromParam(param, TODAY)).toBe(TODAY);
      expect(isViewableDay(param, TODAY)).toBe(false);
    },
  );

  it("steps across month and year ends", () => {
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("keeps today as the plain URL", () => {
    expect(dayHref(TODAY, TODAY)).toBe("/sales");
    expect(dayHref("2026-10-31", TODAY)).toBe("/sales?date=2026-10-31");
  });

  it("reads today in India, not the device's zone", () => {
    expect(istToday(new Date("2026-11-03T18:29:00Z"))).toBe("2026-11-03");
    expect(istToday(new Date("2026-11-03T18:30:00Z"))).toBe("2026-11-04");
  });
});
