import { tencentKlineUrl, type DailyBar, type StockKline } from "@/lib/public-kline";
import { toOhlcBar } from "@/lib/quotes";
import { MAX_PER_STOCK, round2 } from "@/lib/rules";
import {
  MAX_DAY_GAIN,
  MAX_VOLUME_RATIO,
  MIN_VOLUME_RATIO,
  type ScanSkipReason,
} from "@/lib/scan-constants";
import type { Board, Candidate } from "@/lib/types";
import { isGrowthBoard, limitUpThreshold } from "@/lib/universe";

export {
  HARD_RULE_LINES,
  MAX_CANDIDATES,
  SKIP_COPY,
  bumpSkip,
  emptyScanStats,
  klineCapNote,
  topSkipLines,
  type ScanSkipReason,
  type ScanStats,
} from "@/lib/scan-constants";

export const LOT_SIZE = 100;
export const MIN_BARS = 20;
export const MAX_CONSECUTIVE_UP = 2;
export const MIN_CLOSE_LOCATION = 0.5;
export const MAX_UPPER_SHADOW_RATIO = 0.5;
export const MAX_RANGE_PCT = 8;
export const MIN_REWARD_RISK = 1.3;
export const MAX_STOP_PCT = 0.06;
export const MIN_STOP_PCT = 0.012;
export const MAX_GAP_UP_PCT = 4;
export const ATR_PERIOD = 10;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function consecutiveUpDays(bars: DailyBar[]): number {
  let count = 0;
  for (let i = bars.length - 1; i > 0; i -= 1) {
    if (bars[i].close > bars[i - 1].close) count += 1;
    else break;
  }
  return count;
}

function averageTrueRange(bars: DailyBar[], period: number): number {
  const trs: number[] = [];
  const start = Math.max(1, bars.length - period);
  for (let i = start; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    trs.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)),
    );
  }
  return mean(trs);
}

export type SetupEval = { ok: false; reason: ScanSkipReason } | { ok: true; candidate: Candidate };

export function evaluateSetup(kline: StockKline, board: Board): SetupEval {
  const bars = kline.bars;
  if (bars.length < MIN_BARS) return { ok: false, reason: "bars" };
  if (kline.name.includes("ST")) return { ok: false, reason: "st" };

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const last = lastBar.close;
  if (last * LOT_SIZE > MAX_PER_STOCK) return { ok: false, reason: "lot" };

  const ma5 = round2(mean(bars.slice(-5).map((bar) => bar.close)));
  const ma10 = round2(mean(bars.slice(-10).map((bar) => bar.close)));
  const prior = bars.slice(-11, -1);
  const avgVolume = mean(prior.slice(-5).map((bar) => bar.volume));
  const volumeRatio = avgVolume > 0 ? round2(lastBar.volume / avgVolume) : 0;
  const changePct = lastBar.changePct;
  const upDays = consecutiveUpDays(bars);
  const limitPct = limitUpThreshold(board);
  const limitUp = changePct >= limitPct;
  const oneWordLimit = limitUp && lastBar.high === lastBar.low;

  if (volumeRatio < MIN_VOLUME_RATIO) return { ok: false, reason: "volume-low" };
  if (volumeRatio > MAX_VOLUME_RATIO) return { ok: false, reason: "volume-climax" };
  if (last <= ma5 || last <= ma10) return { ok: false, reason: "ma" };
  if (ma5 < ma10) return { ok: false, reason: "ma-bear" };
  if (limitUp || oneWordLimit) return { ok: false, reason: "limit-up" };
  if (upDays > MAX_CONSECUTIVE_UP) return { ok: false, reason: "up-days" };
  if (changePct >= MAX_DAY_GAIN) return { ok: false, reason: "day-gain" };

  const maxExtension = isGrowthBoard(board) ? 0.08 : 0.06;
  const extension = ma10 > 0 ? (last - ma10) / ma10 : 0;
  if (extension > maxExtension) return { ok: false, reason: "extended" };

  const dayRange = lastBar.high - lastBar.low;
  const rangePct = last > 0 ? (dayRange / last) * 100 : 0;
  if (rangePct > MAX_RANGE_PCT) return { ok: false, reason: "wide-range" };

  const closeLocation = dayRange > 0 ? (last - lastBar.low) / dayRange : 1;
  if (closeLocation < MIN_CLOSE_LOCATION) return { ok: false, reason: "weak-close" };

  const upperShadow = lastBar.high - Math.max(lastBar.open, last);
  const upperShadowRatio = dayRange > 0 ? upperShadow / dayRange : 0;
  if (upperShadowRatio > MAX_UPPER_SHADOW_RATIO) return { ok: false, reason: "upper-shadow" };

  if (prevBar.close > 0) {
    const gapPct = ((lastBar.open - prevBar.close) / prevBar.close) * 100;
    if (gapPct >= MAX_GAP_UP_PCT) return { ok: false, reason: "gap-up" };
    if (prevBar.changePct <= -limitPct) return { ok: false, reason: "limit-down-bounce" };
  }

  const lookback = bars.slice(-11, -1);
  const recentHigh = Math.max(...lookback.map((bar) => bar.high));
  const recentLow = Math.min(...bars.slice(-6).map((bar) => bar.low));
  const trueRange = averageTrueRange(bars, ATR_PERIOD);

  let stop = Math.min(recentLow * 0.997, ma10 * 0.995, last - trueRange);
  stop = round2(Math.min(stop, last - 0.01));
  let stopPct = last > 0 ? (last - stop) / last : 1;
  if (stopPct > MAX_STOP_PCT) return { ok: false, reason: "stop-wide" };
  if (stopPct < MIN_STOP_PCT) {
    stop = round2(last * (1 - MIN_STOP_PCT));
    stopPct = MIN_STOP_PCT;
  }

  const target = round2(recentHigh);
  if (target <= last * 1.008) return { ok: false, reason: "no-room" };

  const risk = last - stop;
  const reward = target - last;
  const rewardRisk = risk > 0 ? round2(reward / risk) : 0;
  if (rewardRisk < MIN_REWARD_RISK) return { ok: false, reason: "rr" };

  const setupKind =
    extension <= 0.025 && volumeRatio >= 1.25 && changePct >= 0
      ? "回踩均线后放量"
      : ma5 > ma10 && changePct < 3 && extension < 0.04
        ? "沿均线温和上移"
        : "整理后收强";

  const holdDays = isGrowthBoard(board) ? 3 : extension <= 0.025 ? 4 : 5;
  const setupScore = Math.round(
    20 * Math.min(rewardRisk / 2, 1) +
      20 * (1 - extension / maxExtension) +
      15 * closeLocation +
      15 * (volumeRatio >= 1.3 && volumeRatio <= 2.0 ? 1 : 0.5) +
      15 * (ma5 > ma10 ? 1 : 0) +
      15 * (changePct < 3 ? 1 : 0.4),
  );

  return {
    ok: true,
    candidate: {
      code: kline.code,
      name: kline.name,
      board,
      last: round2(last),
      changePct: round2(changePct),
      volumeRatio,
      ma5,
      ma10,
      consecutiveUpDays: upDays,
      limitUp: false,
      setupKind,
      setupScore,
      rewardRisk,
      targetPrice: target,
      suggestedStopPrice: stop,
      extensionPct: round2(extension * 100),
      reasons: [
        `${setupKind}：量比 ${volumeRatio.toFixed(2)}，今天涨跌 ${changePct.toFixed(2)}%，离开 10 日线约 ${(extension * 100).toFixed(1)}%。这是结构过滤，不是胜率预测。`,
        `收盘 ${last.toFixed(2)} 元，5 日线 ${ma5.toFixed(2)}，10 日线 ${ma10.toFixed(2)}；短线均线没有走空。`,
        `计划看到 ${target.toFixed(2)}（近 10 日高点），止损 ${stop.toFixed(2)}，盈亏比约 ${rewardRisk.toFixed(2)}。达不到 1.3 的票已经挡掉。`,
      ],
      invalidateWhen: [
        `收盘跌破 ${stop.toFixed(2)}，或重新掉回 10 日均线下方，本计划作废。`,
        "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
        `3～5 个交易日内到不了 ${target.toFixed(2)}、结构变钝，按时间离场，不改成中线。`,
      ],
      suggestedStopPct: round2(stopPct),
      suggestedHoldDays: holdDays,
      bar: toOhlcBar(lastBar),
      sourceUrl: `/api/kline?code=${kline.code}`,
      upstreamUrl: tencentKlineUrl(kline.code),
    },
  };
}
