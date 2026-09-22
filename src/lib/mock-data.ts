import { formatMonthDay, sessionMeta } from "@/lib/market";
import { synthOhlc } from "@/lib/quotes";
import { MAX_CANDIDATES } from "@/lib/scan-constants";
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
    setupKind: "回踩均线后放量",
    setupScore: 78,
    rewardRisk: 1.62,
    targetPrice: 4.44,
    suggestedStopPrice: 4.02,
    extensionPct: 4.0,
    reasons: [
      "回踩均线后放量：量比 1.72，今天只涨 1.21%，离开 10 日线约 4.0%。这是结构过滤，不是胜率预测。",
      "收盘 4.18 元，5 日线 4.09，10 日线 4.02；短线均线没有走空。",
      "计划看到 4.44（近 10 日高点），止损 4.02，盈亏比约 1.62。达不到 1.3 的票已经挡掉。",
    ],
    invalidateWhen: [
      "收盘跌破 4.02，或重新掉回 10 日均线下方，本计划作废。",
      "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
      "3～5 个交易日内到不了 4.44、结构变钝，按时间离场，不改成中线。",
    ],
    suggestedStopPct: 0.038,
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
    setupKind: "沿均线温和上移",
    setupScore: 74,
    rewardRisk: 1.47,
    targetPrice: 6.12,
    suggestedStopPrice: 5.68,
    extensionPct: 2.6,
    reasons: [
      "沿均线温和上移：量比 1.64，今天涨 0.86%，离开 10 日线约 2.6%。这是结构过滤，不是胜率预测。",
      "收盘 5.86 元，5 日线 5.79，10 日线 5.71；短线均线没有走空。",
      "计划看到 6.12（近 10 日高点），止损 5.68，盈亏比约 1.47。达不到 1.3 的票已经挡掉。",
    ],
    invalidateWhen: [
      "收盘跌破 5.68，或重新掉回 10 日均线下方，本计划作废。",
      "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
      "3～5 个交易日内到不了 6.12、结构变钝，按时间离场，不改成中线。",
    ],
    suggestedStopPct: 0.031,
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
    setupKind: "回踩均线后放量",
    setupScore: 72,
    rewardRisk: 1.55,
    targetPrice: 7.58,
    suggestedStopPrice: 6.97,
    extensionPct: 3.9,
    reasons: [
      "回踩均线后放量：量比 1.88，今天涨 1.55%，离开 10 日线约 3.9%。这是结构过滤，不是胜率预测。",
      "收盘 7.21 元，5 日线 7.06，10 日线 6.94；短线均线没有走空。",
      "计划看到 7.58（近 10 日高点），止损 6.97，盈亏比约 1.55。达不到 1.3 的票已经挡掉。",
    ],
    invalidateWhen: [
      "收盘跌破 6.97，或重新掉回 10 日均线下方，本计划作废。",
      "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
      "3～5 个交易日内到不了 7.58、结构变钝，按时间离场，不改成中线。",
    ],
    suggestedStopPct: 0.033,
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
    setupKind: "沿均线温和上移",
    setupScore: 70,
    rewardRisk: 1.41,
    targetPrice: 11.72,
    suggestedStopPrice: 11.1,
    extensionPct: 1.5,
    reasons: [
      "沿均线温和上移：量比 1.51，今天涨 0.62%，离开 10 日线约 1.5%。这是结构过滤，不是胜率预测。",
      "收盘 11.36 元，5 日线 11.28，10 日线 11.19；短线均线没有走空。",
      "计划看到 11.72（近 10 日高点），止损 11.10，盈亏比约 1.41。达不到 1.3 的票已经挡掉。",
    ],
    invalidateWhen: [
      "收盘跌破 11.10，或重新掉回 10 日均线下方，本计划作废。",
      "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
      "3～5 个交易日内到不了 11.72、结构变钝，按时间离场，不改成中线。",
    ],
    suggestedStopPct: 0.023,
    suggestedHoldDays: 5,
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
    setupKind: "沿均线温和上移",
    setupScore: 69,
    rewardRisk: 1.38,
    targetPrice: 28.46,
    suggestedStopPrice: 27.41,
    extensionPct: 1.2,
    reasons: [
      "沿均线温和上移：量比 1.46，今天涨 0.43%，离开 10 日线约 1.2%。这是结构过滤，不是胜率预测。",
      "收盘 27.85 元，5 日线 27.71，10 日线 27.52；短线均线没有走空。",
      "计划看到 28.46（近 10 日高点），止损 27.41，盈亏比约 1.38。达不到 1.3 的票已经挡掉。",
    ],
    invalidateWhen: [
      "收盘跌破 27.41，或重新掉回 10 日均线下方，本计划作废。",
      "下一笔开盘直接封涨停，放弃追入。涨停板不是买入信号。",
      "3～5 个交易日内到不了 28.46、结构变钝，按时间离场，不改成中线。",
    ],
    suggestedStopPct: 0.016,
    suggestedHoldDays: 5,
  },
];

export function getDeskPayload(scene: "ok" | "empty" = "ok"): DeskPayload {
  const meta = sessionMeta();
  const candidates =
    scene === "empty"
      ? []
      : MOCK_SEEDS.slice(0, MAX_CANDIDATES).map((seed) => ({
          ...seed,
          bar: synthOhlc(meta.asOf, seed.last, seed.changePct),
          sourceUrl: "",
        }));
  const quotes: QuoteBook = Object.fromEntries(candidates.map((item) => [item.code, [item.bar]]));
  const notice =
    scene === "empty"
      ? "模拟扫描没有找出符合硬规则的标的（回踩均线、温和放量、上方有空间、盈亏比至少 1.3）。空仓也是一种计划，不是系统失灵。"
      : meta.marketOpen
        ? `候选按 ${meta.asOf} 收盘的模拟量价扫描，最多 ${MAX_CANDIDATES} 只，按结构而不是谁量最大。成交按昨收近似，仅供纸上推演。`
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
    scanStats:
      scene === "empty"
        ? {
            pool: 5200,
            fetched: 80,
            passed: 0,
            skipped: { extended: 12, rr: 9, "volume-climax": 6 },
            samples: [
              { code: "601012", name: "隆基绿能", reason: "extended" },
              { code: "300059", name: "东方财富", reason: "rr" },
              { code: "601138", name: "工业富联", reason: "volume-climax" },
            ],
            shortlisted: 80,
            listVia: "eastmoney",
          }
        : {
            pool: 40,
            fetched: 40,
            passed: candidates.length,
            skipped: { extended: 8, rr: 7 },
            samples: [],
            shortlisted: 5,
            listVia: "fallback-40",
          },
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
      "正在扫沪深A股公开快照，再对进入复核的票拉日K。Chrome 直连 gtimg 会 501，请看 /api/desk。",
  };
}
