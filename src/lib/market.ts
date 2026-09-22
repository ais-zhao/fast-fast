/** A-share calendar helpers. First slice only skips weekends. */

export function chinaTodayISO(now = new Date()): string {
  const cn = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cn.toISOString().slice(0, 10);
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

export function weekdayIndex(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const day = weekdayIndex(iso);
  return day === 0 || day === 6;
}

export function previousTradingDay(iso: string): string {
  let cursor = addCalendarDays(iso, -1);
  while (isWeekend(cursor)) cursor = addCalendarDays(cursor, -1);
  return cursor;
}

export function nextTradingDay(iso: string): string {
  let cursor = addCalendarDays(iso, 1);
  while (isWeekend(cursor)) cursor = addCalendarDays(cursor, 1);
  return cursor;
}

export function tradingDaysBetween(from: string, to: string): number {
  if (from === to) return 0;
  if (to < from) return -tradingDaysBetween(to, from);
  let n = 0;
  let cursor = from;
  while (cursor < to) {
    cursor = nextTradingDay(cursor);
    n += 1;
    if (n > 40) break;
  }
  return n;
}

export function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

export function sessionMeta(today = chinaTodayISO()) {
  const marketOpen = !isWeekend(today);
  const planFor = marketOpen ? today : nextTradingDay(today);
  const asOf = previousTradingDay(planFor);
  const sessionLabel = marketOpen
    ? `${formatMonthDay(today)} 交易日`
    : `休市 · ${formatMonthDay(planFor)} 预案`;
  return { today, marketOpen, planFor, asOf, sessionLabel };
}
