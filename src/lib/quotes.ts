import { nextTradingDay, tradingDaysBetween } from "@/lib/market";
import { round2 } from "@/lib/rules";

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
