export const MAX_CANDIDATES = 5;

export type ScanSkipReason =
  | "bars"
  | "st"
  | "lot"
  | "volume-low"
  | "volume-climax"
  | "ma"
  | "ma-bear"
  | "limit-up"
  | "up-days"
  | "day-gain"
  | "extended"
  | "upper-shadow"
  | "weak-close"
  | "wide-range"
  | "gap-up"
  | "limit-down-bounce"
  | "no-room"
  | "stop-wide"
  | "rr"
  | "fetch-fail";

export const SKIP_COPY: Record<ScanSkipReason, string> = {
  bars: "日K不足 20 根",
  st: "ST",
  lot: "一手超过 2 万",
  "volume-low": "量比不够",
  "volume-climax": "爆量高潮",
  ma: "未站上均线",
  "ma-bear": "均线空头",
  "limit-up": "涨停或一字板",
  "up-days": "连涨过多",
  "day-gain": "当日涨幅过大",
  extended: "远离均线",
  "upper-shadow": "长上影抛压",
  "weak-close": "收盘偏弱",
  "wide-range": "振幅过大",
  "gap-up": "高开追空",
  "limit-down-bounce": "跌停反抽",
  "no-room": "上方没有空间",
  "stop-wide": "止损过宽",
  rr: "盈亏比不够",
  "fetch-fail": "日K没拉到",
};

export const HARD_RULE_LINES = [
  "一手不超过 2 万；ST、涨停、一字板不要",
  "量比 1.2～2.8，爆量高潮不要",
  "收盘站上 5 日和 10 日线，且 5 日线不低于 10 日线",
  "离开 10 日线：主板不超过 6%，创业板不超过 8%",
  "当日涨幅小于 5%，连涨不超过 2 天；高开超过 4% 当追空处理",
  "收盘要落在当日区间上半，长上影、振幅过大不要",
  "近 10 日高点要有空间；止损不超过 6%，盈亏比至少 1.3",
  "最多 5 只，按结构排序，不是谁量最大谁上榜",
];

export type ScanStats = {
  pool: number;
  fetched: number;
  passed: number;
  skipped: Partial<Record<ScanSkipReason, number>>;
  samples: { code: string; name: string; reason: ScanSkipReason }[];
};

export function emptyScanStats(pool: number): ScanStats {
  return { pool, fetched: 0, passed: 0, skipped: {}, samples: [] };
}

export function bumpSkip(
  stats: ScanStats,
  reason: ScanSkipReason,
  sample?: { code: string; name: string },
) {
  stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
  if (sample && stats.samples.length < 8) {
    stats.samples.push({ ...sample, reason });
  }
}

export function topSkipLines(
  stats: { skipped: Partial<Record<string, number>> },
  limit = 3,
): string {
  const rows = Object.entries(stats.skipped)
    .filter((entry): entry is [ScanSkipReason, number] => entry[0] in SKIP_COPY && typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => `${SKIP_COPY[key]} ${count} 只`);
  return rows.join(" · ");
}
