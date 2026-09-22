import { formatMonthDay, sessionMeta } from "@/lib/market";
import { synthOhlc } from "@/lib/quotes";
import type { Candidate, DeskPayload, QuoteBook } from "@/lib/types";

type MockSeed = Omit<Candidate, "bar" | "sourceUrl">;

export const MOCK_SEEDS: MockSeed[] = [
  {
    code: "000725",
    name: "京东方A",
    board: "主板",
    last: 4.18,
    changePct: 1.21,
    volumeRatio: 1.72,
    ma5: 4.09,
    ma10: 4.02,
    consecutiveUpDays: 1,
    limitUp: false,
    reasons: [
      "近四个交易日成交量抬到均量约 1.7 倍，但今天只涨 1.2%，离涨停还很远，不是在追板。",
      "收盘 4.18 元，站上 5 日均线（4.09），5 日线仍在 10 日线（4.02）上方。",
      "没有连涨三天，不属于高潮后的追高。",
    ],
    invalidateWhen: [
      "收盘跌破计划止损，或明显跌回 10 日均线下方，本计划作废。",
      "若下一笔开盘直接封涨停，放弃追入。",
    ],
    suggestedStopPct: 0.045,
    suggestedHoldDays: 4,
  },
  {
    code: "601668",
    name: "中国建筑",
    board: "主板",
    last: 5.86,
    changePct: 0.86,
    volumeRatio: 1.64,
    ma5: 5.79,
    ma10: 5.71,
    consecutiveUpDays: 2,
    limitUp: false,
    reasons: [
      "放量但不剧烈：量比约 1.6，价格只温和上移，符合波段而不是情绪高潮。",
      "收盘站上 5 日与 10 日均线，短线结构还没坏。",
      "今天涨幅不到 1%，按规则不把涨停当买入信号。",
    ],
    invalidateWhen: [
      "跌破计划止损价，视为结构破坏，离场。",
      "如果突然连续加速大涨后再回落，不再加仓、不再追。",
    ],
    suggestedStopPct: 0.04,
    suggestedHoldDays: 5,
  },
  {
    code: "002027",
    name: "分众传媒",
    board: "主板",
    last: 7.21,
    changePct: 1.55,
    volumeRatio: 1.88,
    ma5: 7.06,
    ma10: 6.94,
    consecutiveUpDays: 1,
    limitUp: false,
    reasons: [
      "近几日明显放量，量比接近 1.9，但收盘没有封板，也不是一字涨停。",
      "价格重新站上 5 日均线，和 10 日均线有一点缓冲。",
      "适合用小仓位试 3～5 日波段，而不是当天进出。",
    ],
    invalidateWhen: [
      "收盘跌破止损，或放量长阴打回均线之下。",
      "开盘冲高接近涨停时不追，计划作废。",
    ],
    suggestedStopPct: 0.05,
    suggestedHoldDays: 4,
  },
  {
    code: "000001",
    name: "平安银行",
    board: "主板",
    last: 11.36,
    changePct: 0.62,
    volumeRatio: 1.51,
    ma5: 11.28,
    ma10: 11.19,
    consecutiveUpDays: 2,
    limitUp: false,
    reasons: [
      "成交比近均略增，属于温和放量，不是爆量高潮。",
      "收盘价在 5 日、10 日均线之上，涨幅很小，追高风险相对低。",
      "银行股波动通常不如题材股剧烈，更适合纪律型波段。",
    ],
    invalidateWhen: [
      "跌破计划止损即走，不和均线死扛。",
      "如果出现大阴线跌破 10 日线，不再持有。",
    ],
    suggestedStopPct: 0.035,
    suggestedHoldDays: 5,
  },
  {
    code: "601138",
    name: "工业富联",
    board: "主板",
    last: 22.48,
    changePct: 2.09,
    volumeRatio: 1.93,
    ma5: 21.86,
    ma10: 21.42,
    consecutiveUpDays: 1,
    limitUp: false,
    reasons: [
      "放量上涨约 2%，离涨停还有较大距离，按规则不算打板。",
      "收盘站上 5 日均线，且 5 日线已转到 10 日线上方。",
      "昨天没有连涨三天，今天也不是连续大涨后的第四天追高。",
    ],
    invalidateWhen: [
      "跌破止损或重新掉到 10 日均线下方，计划作废。",
      "若次日高开接近涨停，不追买。",
    ],
    suggestedStopPct: 0.05,
    suggestedHoldDays: 3,
  },
  {
    code: "600900",
    name: "长江电力",
    board: "主板",
    last: 27.85,
    changePct: 0.43,
    volumeRatio: 1.46,
    ma5: 27.71,
    ma10: 27.52,
    consecutiveUpDays: 1,
    limitUp: false,
    reasons: [
      "量能略增、涨幅很小，更像均线附近的整理转强，不是情绪票。",
      "收盘在 5 日与 10 日均线之上，结构简单清楚。",
      "波动相对可控，便于练习止损和持有天数。",
    ],
    invalidateWhen: [
      "收盘跌破计划止损，不再解释、不再补仓。",
      "如果突然放量长阴，视为计划失效。",
    ],
    suggestedStopPct: 0.03,
    suggestedHoldDays: 5,
  },
  {
    code: "002415",
    name: "海康威视",
    board: "主板",
    last: 31.6,
    changePct: 1.38,
    volumeRatio: 1.67,
    ma5: 31.12,
    ma10: 30.68,
    consecutiveUpDays: 2,
    limitUp: false,
    reasons: [
      "近几日放量，今天涨约 1.4%，不是涨停板附近的拥挤交易。",
      "价格站上短期均线，5 日线仍高于 10 日线。",
      "连涨天数只有 2 天，还没到连续大涨后的追高区间。",
    ],
    invalidateWhen: [
      "触及止损或收盘跌破 10 日均线，离场。",
      "若出现接近涨停的跳空，放弃按原价追入。",
    ],
    suggestedStopPct: 0.045,
    suggestedHoldDays: 4,
  },
  {
    code: "300124",
    name: "汇川技术",
    board: "创业板",
    last: 58.4,
    changePct: 1.92,
    volumeRatio: 1.81,
    ma5: 57.15,
    ma10: 56.22,
    consecutiveUpDays: 1,
    limitUp: false,
    reasons: [
      "创业板票，但今天没有涨停，也不是一字板，符合「不打板」的过滤。",
      "放量约 1.8 倍均量，收盘站上 5 日均线。",
      "一手金额仍低于 2 万上限，可以按规则用小仓位练波段。",
    ],
    invalidateWhen: [
      "创业板波动更大：跌破止损必须走，不扛。",
      "如果次日冲涨停，不把涨停当加仓信号。",
    ],
    suggestedStopPct: 0.055,
    suggestedHoldDays: 3,
  },
];

export function getDeskPayload(scene: "ok" | "empty" = "ok"): DeskPayload {
  const meta = sessionMeta();
  const candidates =
    scene === "empty"
      ? []
      : MOCK_SEEDS.slice(0, 8).map((seed) => ({
          ...seed,
          bar: synthOhlc(meta.asOf, seed.last, seed.changePct),
          sourceUrl: "",
        }));
  const quotes: QuoteBook = Object.fromEntries(candidates.map((item) => [item.code, [item.bar]]));
  const notice =
    scene === "empty"
      ? "模拟扫描没有找出符合规则的标的（放量、站上均线、且不是涨停追高）。空仓也是一种计划。"
      : meta.marketOpen
        ? `候选按 ${meta.asOf} 收盘的模拟量价扫描，最多 8 只。成交按昨收近似，仅供纸上推演。`
        : `今天休市。下面是 ${formatMonthDay(meta.planFor)} 的预案，数据来自 ${meta.asOf} 收盘的模拟扫描，不是实时行情。`;

  return {
    asOf: meta.asOf,
    planFor: meta.planFor,
    calendarToday: meta.today,
    marketOpen: meta.marketOpen,
    sessionLabel: meta.sessionLabel,
    candidates,
    notice,
    dataSource: "offline-demo" as const,
    quotes,
  };
}

export function loadingDeskPayload(): DeskPayload {
  const meta = sessionMeta();
  return {
    asOf: meta.asOf,
    planFor: meta.planFor,
    calendarToday: meta.today,
    marketOpen: meta.marketOpen,
    sessionLabel: meta.sessionLabel,
    candidates: [],
    quotes: {},
    dataSource: "delayed-public",
    notice:
      "正在由本机服务端向腾讯财经拉取前复权日K。Chrome 直连 gtimg 会 501，请看 /api/desk。首屏不再塞模拟名单。",
  };
}
