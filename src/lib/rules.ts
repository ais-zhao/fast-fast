export const TOTAL_CAPITAL = 100_000;
export const MAX_PER_STOCK = 20_000;
export const MAX_HOLDINGS = 3;
export const MIN_CASH_BUFFER = 40_000;
export const LOT_SIZE = 100;
export const MIN_HOLD_DAYS = 3;
export const MAX_HOLD_DAYS = 5;
export const DEFAULT_HOLD_DAYS = 4;
export const MAX_RISK_PER_TRADE = 2_000;

export type BuyBlockReason =
  | "already-held"
  | "max-holdings"
  | "over-cap"
  | "lot-too-big"
  | "cash-buffer"
  | "cash"
  | "lots";

const BUY_BLOCK_COPY: Record<BuyBlockReason, string> = {
  "already-held": "已经持有这只股票，第一版不叠加加仓。",
  "max-holdings": "同时最多 3 只，先处理现有持仓再开新仓。",
  "over-cap": "单票不超过总资金 20%，这一笔最多 2 万元。",
  "lot-too-big": "一手已经超过 2 万元上限，按规则不能买。",
  cash: "现金不够支付这一笔。",
  "cash-buffer": "至少留 4 万现金缓冲，这一笔会把现金打穿。",
  lots: "至少买 1 手（100 股）。",
};

export function buyBlockCopy(reason: BuyBlockReason): string {
  return BUY_BLOCK_COPY[reason];
}

export function positionCost(lots: number, price: number): number {
  return round2(lots * LOT_SIZE * price);
}

export function maxLotsForPrice(price: number): number {
  if (price <= 0) return 0;
  return Math.floor(MAX_PER_STOCK / (price * LOT_SIZE));
}

export function suggestedLots(price: number, cash: number, stopPrice?: number): number {
  const byCap = maxLotsForPrice(price);
  const byCash = Math.floor(Math.max(0, cash - MIN_CASH_BUFFER) / (price * LOT_SIZE));
  let byRisk = byCap;
  if (stopPrice != null && stopPrice < price) {
    const riskPerLot = (price - stopPrice) * LOT_SIZE;
    if (riskPerLot > 0) byRisk = Math.floor(MAX_RISK_PER_TRADE / riskPerLot);
  }
  return Math.max(0, Math.min(byCap, byCash, byRisk));
}

export function canOpenPosition(input: {
  code: string;
  lots: number;
  price: number;
  cash: number;
  openCodes: string[];
}): { ok: true; cost: number } | { ok: false; reason: BuyBlockReason } {
  const { code, lots, price, cash, openCodes } = input;
  if (openCodes.includes(code)) return { ok: false, reason: "already-held" };
  if (openCodes.length >= MAX_HOLDINGS) return { ok: false, reason: "max-holdings" };
  if (lots < 1) return { ok: false, reason: "lots" };
  if (maxLotsForPrice(price) < 1) return { ok: false, reason: "lot-too-big" };
  const cost = positionCost(lots, price);
  if (cost - MAX_PER_STOCK > 0.01) return { ok: false, reason: "over-cap" };
  if (cost - cash > 0.01) return { ok: false, reason: "cash" };
  if (cash - cost + 0.01 < MIN_CASH_BUFFER) return { ok: false, reason: "cash-buffer" };
  return { ok: true, cost };
}

export function suggestedStop(
  last: number,
  ma10: number,
  stopPct: number,
  structuralStop?: number,
): number {
  if (structuralStop != null && structuralStop < last) {
    return round2(Math.min(structuralStop, last - 0.01));
  }
  const pctStop = last * (1 - stopPct);
  const maStop = ma10 * 0.995;
  const stop = Math.min(pctStop, maStop);
  return round2(Math.min(stop, last - 0.01));
}

export function rewardRisk(entry: number, stop: number, target: number): number {
  const risk = entry - stop;
  if (risk <= 0) return 0;
  return round2((target - entry) / risk);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampHoldDays(days: number): number {
  return Math.min(MAX_HOLD_DAYS, Math.max(MIN_HOLD_DAYS, Math.round(days)));
}
