import { fetchDailyKline, mapPool, tencentKlineUrl, type DailyBar, type StockKline } from "@/lib/public-kline";
import { sessionMeta } from "@/lib/market";
import { toOhlcBar } from "@/lib/quotes";
import { MAX_PER_STOCK, round2 } from "@/lib/rules";
import type { Board, Candidate, DeskPayload, QuoteBook } from "@/lib/types";
import { SCAN_UNIVERSE, limitUpThreshold } from "@/lib/universe";

const LOT_SIZE = 100;
const MAX_CANDIDATES = 8;
const MIN_VOLUME_RATIO = 1.15;
const MAX_DAY_GAIN = 7;
const MAX_CONSECUTIVE_UP = 2;

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

function toCandidate(kline: StockKline, board: Board): Candidate | null {
  const bars = kline.bars;
  const lastBar = bars[bars.length - 1];
  const prev = bars.slice(-11, -1);
  if (!lastBar || prev.length < 10) return null;
  if (kline.name.includes("ST")) return null;

  const last = lastBar.close;
  if (last * LOT_SIZE > MAX_PER_STOCK) return null;

  const ma5 = round2(mean(bars.slice(-5).map((bar) => bar.close)));
  const ma10 = round2(mean(bars.slice(-10).map((bar) => bar.close)));
  const avgVolume = mean(prev.slice(-5).map((bar) => bar.volume));
  const volumeRatio = avgVolume > 0 ? round2(lastBar.volume / avgVolume) : 0;
  const changePct = lastBar.changePct;
  const upDays = consecutiveUpDays(bars);
  const limitPct = limitUpThreshold(board);
  const limitUp = changePct >= limitPct;
  const oneWordLimit = limitUp && lastBar.high === lastBar.low;

  if (volumeRatio < MIN_VOLUME_RATIO) return null;
  if (last <= ma5 || last <= ma10) return null;
  if (limitUp || oneWordLimit) return null;
  if (upDays > MAX_CONSECUTIVE_UP) return null;
  if (changePct >= MAX_DAY_GAIN) return null;

  const stopPct = board === "创业板" ? 0.055 : 0.04;
  const holdDays = board === "创业板" ? 3 : upDays <= 1 ? 4 : 5;

  return {
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
    reasons: [
      volumeRatio >= 1.3
        ? `近几日成交量抬到均量约 ${volumeRatio.toFixed(1)} 倍，但今天涨跌幅 ${changePct.toFixed(2)}%，离涨停还远，不是在追板。`
        : `量比约 ${volumeRatio.toFixed(2)}，属于温和放量而不是爆量高潮；今天涨跌幅 ${changePct.toFixed(2)}%，不按涨停去追。`,
      `最新价 ${last.toFixed(2)} 元，站上 5 日均线（${ma5.toFixed(2)}），也在 10 日均线（${ma10.toFixed(2)}）之上。`,
      upDays === 0
        ? "今天没有收红连涨，不属于高潮后的追高。"
        : `连涨 ${upDays} 天，仍低于连续大涨三天的追高过滤。`,
    ],
    invalidateWhen: [
      "收盘跌破计划止损，或明显跌回 10 日均线下方，本计划作废。",
      "若下一笔开盘直接封涨停，放弃追入。涨停板不作为买入信号。",
    ],
    suggestedStopPct: stopPct,
    suggestedHoldDays: holdDays,
    bar: toOhlcBar(lastBar),
    sourceUrl: `/api/kline?code=${kline.code}`,
    upstreamUrl: tencentKlineUrl(kline.code),
  };
}

export async function scanDelayedDesk(heldCodes: string[] = []): Promise<DeskPayload> {
  const meta = sessionMeta();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const extraHeld = heldCodes
    .filter((code) => /^\d{6}$/.test(code))
    .filter((code) => !SCAN_UNIVERSE.some((item) => item.code === code))
    .slice(0, 3)
    .map((code) => ({
      code,
      board: (code.startsWith("3") ? "创业板" : "主板") as Board,
    }));
  const pool = [...SCAN_UNIVERSE, ...extraHeld];

  try {
    const fetched = await mapPool(pool, 8, async (item) => {
      try {
        const kline = await fetchDailyKline(item.code, controller.signal);
        if (!kline) return { kline: null, candidate: null };
        return { kline, candidate: toCandidate(kline, item.board) };
      } catch {
        return { kline: null, candidate: null };
      }
    });

    const gotBars = fetched.filter((row) => row.kline).length;
    if (gotBars < 5) {
      throw new Error(`只拉到 ${gotBars} 只日K，不足 5 只。本机请打开 /api/kline?code=000001`);
    }

    const candidates = fetched
      .map((row) => row.candidate)
      .filter((row): row is Candidate => row !== null)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, MAX_CANDIDATES);

    const asOf =
      fetched.reduce((latest, row) => {
        const date = row.kline?.bars.at(-1)?.date;
        return date && date > latest ? date : latest;
      }, meta.asOf);
    const notice =
      candidates.length === 0
        ? "公开延迟行情已取到，但这一批观察池里没有同时满足：放量、站上均线、且不是涨停追高。空仓也是一种计划。"
        : `候选来自本机服务端代拉的公开延迟日K（腾讯优先，不通则新浪）。Chrome 直连 ifzq.gtimg.cn 常会 501，请看 /api/desk。不是实时成交价，更不是投资建议。`;

    const quotes: QuoteBook = {};
    const keep = new Set([...candidates.map((item) => item.code), ...heldCodes]);
    for (const row of fetched) {
      if (!row.kline || !keep.has(row.kline.code)) continue;
      quotes[row.kline.code] = row.kline.bars.slice(-20).map(toOhlcBar);
    }

    return {
      asOf,
      planFor: meta.planFor,
      calendarToday: meta.today,
      marketOpen: meta.marketOpen,
      sessionLabel: meta.sessionLabel,
      candidates,
      notice,
      dataSource: "delayed-public",
      quotes,
    };
  } finally {
    clearTimeout(timer);
  }
}
