import { formatMonthDay, nextTradingDay, tradingDaysBetween } from "@/lib/market";
import { markPrice } from "@/lib/quotes";
import {
  TOTAL_CAPITAL,
  buyBlockCopy,
  canOpenPosition,
  clampHoldDays,
  round2,
} from "@/lib/rules";
import type { Candidate, ExitReason, PaperPosition, PaperState } from "@/lib/types";

export const STORAGE_KEY = "swing-desk-paper-v1";

export function createPaperState(sessionDate: string): PaperState {
  return {
    sessionDate,
    cash: TOTAL_CAPITAL,
    positions: [],
    closed: [],
  };
}

export function investedAmount(state: PaperState): number {
  return round2(state.positions.reduce((sum, pos) => sum + pos.cost, 0));
}

export function equity(state: PaperState): number {
  const openValue = state.positions.reduce((sum, pos) => {
    const mark = markPrice(pos.code, pos.entryPrice, pos.openedOn, state.sessionDate);
    return sum + mark * pos.shares;
  }, 0);
  return round2(state.cash + openValue);
}

export function tryOpenPosition(
  state: PaperState,
  candidate: Candidate,
  lots: number,
  stopPrice: number,
  holdDays: number,
): { state: PaperState; error?: string } {
  const check = canOpenPosition({
    code: candidate.code,
    lots,
    price: candidate.last,
    cash: state.cash,
    openCodes: state.positions.map((item) => item.code),
  });
  if (!check.ok) return { state, error: buyBlockCopy(check.reason) };

  const cost = check.cost;
  const position: PaperPosition = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `p-${Date.now()}`,
    code: candidate.code,
    name: candidate.name,
    board: candidate.board,
    lots,
    shares: lots * 100,
    entryPrice: candidate.last,
    cost,
    stopPrice: round2(stopPrice),
    plannedHoldDays: clampHoldDays(holdDays),
    entryReasons: candidate.reasons,
    invalidateWhen: candidate.invalidateWhen,
    openedOn: state.sessionDate,
    status: "open",
    disciplineBreaks: [],
    reviewNotes: [],
  };

  return {
    state: {
      ...state,
      cash: round2(state.cash - cost),
      positions: [position, ...state.positions],
    },
  };
}

export function currentMark(position: PaperPosition, sessionDate: string): number {
  return markPrice(position.code, position.entryPrice, position.openedOn, sessionDate);
}

export function heldTradingDays(position: PaperPosition, sessionDate: string): number {
  return tradingDaysBetween(position.openedOn, sessionDate);
}

export function isTPlusOneLocked(position: PaperPosition, sessionDate: string): boolean {
  return position.openedOn === sessionDate;
}

export function stopWouldHit(position: PaperPosition, sessionDate: string): boolean {
  return currentMark(position, sessionDate) <= position.stopPrice;
}

export function tryClosePosition(
  state: PaperState,
  positionId: string,
  exitReason: ExitReason,
): { state: PaperState; error?: string } {
  const position = state.positions.find((item) => item.id === positionId);
  if (!position) return { state, error: "找不到这笔持仓。" };
  if (isTPlusOneLocked(position, state.sessionDate)) {
    return {
      state,
      error: `T+1：${position.name} 是今天才买的，最早下一交易日才能卖出。同一只股票不能当天买卖。`,
    };
  }

  const exitPrice = currentMark(position, state.sessionDate);
  const heldDays = heldTradingDays(position, state.sessionDate);
  const pnl = round2((exitPrice - position.entryPrice) * position.shares);
  const disciplineBreaks: string[] = [];
  const reviewNotes: string[] = [];

  if (position.stopHitOn && position.stopHitOn < state.sessionDate && exitReason !== "stop") {
    disciplineBreaks.push(
      `止损曾在 ${formatMonthDay(position.stopHitOn)} 被触及，却没有马上按计划离场。`,
    );
  }
  if (heldDays > position.plannedHoldDays) {
    disciplineBreaks.push(
      `计划最多拿 ${position.plannedHoldDays} 天，实际拿了 ${heldDays} 个交易日。`,
    );
  }
  if (exitReason === "stop") {
    reviewNotes.push(
      `按计划止损离场：买入 ${position.entryPrice.toFixed(2)}，止损 ${position.stopPrice.toFixed(2)}，成交 ${exitPrice.toFixed(2)}。`,
    );
  } else if (exitReason === "time") {
    reviewNotes.push(
      `按计划到期离场：计划 ${position.plannedHoldDays} 天，实际持有 ${heldDays} 个交易日。`,
    );
    if (stopWouldHit(position, state.sessionDate)) {
      reviewNotes.push("到期时价格也已经碰到止损附近，按到期处理。");
    }
  } else {
    reviewNotes.push(
      `手动离场：计划 ${position.plannedHoldDays} 天，实际 ${heldDays} 天。提前走可以，但要写清楚是不是被情绪带着走。`,
    );
  }

  if (disciplineBreaks.length === 0) {
    reviewNotes.push("对照计划：仓位、T+1 和持有天数这一笔没有明显破纪律。");
  }

  const closed: PaperPosition = {
    ...position,
    status: "closed",
    exitPrice,
    exitOn: state.sessionDate,
    exitReason,
    heldDays,
    pnl,
    disciplineBreaks,
    reviewNotes,
  };

  return {
    state: {
      ...state,
      cash: round2(state.cash + exitPrice * position.shares),
      positions: state.positions.filter((item) => item.id !== positionId),
      closed: [closed, ...state.closed],
    },
  };
}

export function advanceSession(state: PaperState): PaperState {
  const sessionDate = nextTradingDay(state.sessionDate);
  const positions = state.positions.map((position) => {
    const mark = currentMark({ ...position }, sessionDate);
    if (mark <= position.stopPrice && !position.stopHitOn) {
      return { ...position, stopHitOn: sessionDate };
    }
    return position;
  });
  return { ...state, sessionDate, positions };
}

export function serializePaper(state: PaperState): string {
  return JSON.stringify(state);
}

export function parsePaper(raw: string, fallbackSession: string): PaperState {
  try {
    const data = JSON.parse(raw) as PaperState;
    if (!data || typeof data.sessionDate !== "string" || !Array.isArray(data.positions)) {
      return createPaperState(fallbackSession);
    }
    return {
      sessionDate: data.sessionDate,
      cash: Number(data.cash) || TOTAL_CAPITAL,
      positions: data.positions ?? [],
      closed: data.closed ?? [],
    };
  } catch {
    return createPaperState(fallbackSession);
  }
}

