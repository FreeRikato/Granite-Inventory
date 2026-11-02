export function defaultPayBy(saleDate: string): string {
  const day = new Date(`${saleDate}T00:00:00Z`);
  const weekday = day.getUTCDay();
  const ahead = weekday === 6 ? 7 : (6 - weekday + 7) % 7;
  day.setUTCDate(day.getUTCDate() + ahead);
  return day.toISOString().slice(0, 10);
}
