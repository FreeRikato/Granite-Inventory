const FIRST_DAY = "2000-01-01";
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(value: string): boolean {
  if (!DAY_SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isViewableDay(value: string, today: string): boolean {
  return isCalendarDay(value) && value >= FIRST_DAY && value <= today;
}

export function dayFromParam(param: string | null, today: string): string {
  return param !== null && isViewableDay(param, today) ? param : today;
}

export function shiftDay(day: string, days: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function dayHref(day: string, today: string): string {
  return day === today ? "/sales" : `/sales?date=${day}`;
}
