import { nextTradingDay, tradingDaysBetween } from "@/lib/market";
import { round2 } from "@/lib/rules";
import type { MarkContext, OhlcBar, PaperPosition } from "@/lib/types";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic mock daily return, capped well below limit-up. */
export function sessionReturn(code: string, sessionDate: string): number {
  const unit = (hashString(`${code}:${sessionDate}`) % 1000) / 999;
  return (unit - 0.52) * 0.055;
}

export function markPrice(
  code: string,
  entryPrice: number,
  openedOn: string,
  sessionDate: string,
): number {
  if (sessionDate <= openedOn) return round2(entryPrice);
  let price = entryPrice;
  let cursor = openedOn;
  const steps = tradingDaysBetween(openedOn, sessionDate);
  for (let i = 0; i < steps; i += 1) {
    cursor = nextTradingDay(cursor);
    const raw = price * (1 + sessionReturn(code, cursor));
    const limited = Math.min(entryPrice * 1.09, Math.max(entryPrice * 0.91, raw));
    price = round2(limited);
  }
  return price;
}

export function synthOhlc(date: string, close: number, changePct: number): OhlcBar {
  const prev = close / (1 + changePct / 100);
  const open = round2(prev * (changePct >= 0 ? 1.001 : 0.999));
  const high = round2(Math.max(open, close) * 1.006);
  const low = round2(Math.min(open, close) * 0.996);
  return { date, open, high, low, close: round2(close), volume: 0 };
}

export function toOhlcBar(bar: {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): OhlcBar {
  return {
    date: bar.date,
    open: round2(bar.open),
    high: round2(bar.high),
    low: round2(bar.low),
    close: round2(bar.close),
    volume: bar.volume,
  };
}

export function barOnOrBefore(bars: OhlcBar[] | undefined, sessionDate: string): OhlcBar | undefined {
  if (!bars || bars.length === 0) return undefined;
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].date <= sessionDate) return bars[i];
  }
  return bars[0];
}

export function delayedMark(
  bars: OhlcBar[] | undefined,
  openedOn: string,
  sessionDate: string,
  entryPrice: number,
): number {
  if (sessionDate <= openedOn) return round2(entryPrice);
  const bar = barOnOrBefore(bars, sessionDate);
  return bar ? round2(bar.close) : round2(entryPrice);
}

export function delayedStopTouched(
  bars: OhlcBar[] | undefined,
  openedOn: string,
  sessionDate: string,
  stopPrice: number,
): boolean {
  if (!bars || bars.length === 0) return false;
  return bars.some(
    (bar) => bar.date > openedOn && bar.date <= sessionDate && bar.low <= stopPrice,
  );
}

export function markForPosition(
  position: PaperPosition,
  sessionDate: string,
  ctx?: MarkContext,
): number {
  if (ctx?.dataSource === "delayed-public") {
    return delayedMark(ctx.quotes[position.code], position.openedOn, sessionDate, position.entryPrice);
  }
  return markPrice(position.code, position.entryPrice, position.openedOn, sessionDate);
}

export function latestQuoteDate(ctx?: MarkContext): string | undefined {
  if (!ctx) return undefined;
  let latest = "";
  for (const bars of Object.values(ctx.quotes)) {
    const date = bars.at(-1)?.date;
    if (date && date > latest) latest = date;
  }
  return latest || undefined;
}
