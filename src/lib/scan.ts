import { fetchDailyKline, mapPool } from "@/lib/public-kline";
import { sessionMeta } from "@/lib/market";
import { toOhlcBar } from "@/lib/quotes";
import {
  MAX_CANDIDATES,
  bumpSkip,
  emptyScanStats,
  evaluateSetup,
  topSkipLines,
} from "@/lib/scan-rules";
import type { Board, Candidate, DeskPayload, QuoteBook } from "@/lib/types";
import { SCAN_UNIVERSE } from "@/lib/universe";

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
  const stats = emptyScanStats(pool.length);

  try {
    const fetched = await mapPool(pool, 8, async (item) => {
      try {
        const kline = await fetchDailyKline(item.code, controller.signal);
        if (!kline) {
          bumpSkip(stats, "fetch-fail");
          return { kline: null, candidate: null };
        }
        stats.fetched += 1;
        const evaluated = evaluateSetup(kline, item.board);
        if (!evaluated.ok) {
          bumpSkip(stats, evaluated.reason);
          return { kline, candidate: null };
        }
        stats.passed += 1;
        return { kline, candidate: evaluated.candidate };
      } catch {
        bumpSkip(stats, "fetch-fail");
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
      .sort((a, b) => b.setupScore - a.setupScore || b.rewardRisk - a.rewardRisk)
      .slice(0, MAX_CANDIDATES);

    const asOf =
      fetched.reduce((latest, row) => {
        const date = row.kline?.bars.at(-1)?.date;
        return date && date > latest ? date : latest;
      }, meta.asOf);
    const skipHint = topSkipLines(stats);
    const notice =
      candidates.length === 0
        ? `公开延迟行情已取到。观察池 ${stats.pool} 只，拉到日K ${stats.fetched} 只，硬规则一只都没放过。${
            skipHint ? `主要挡掉：${skipHint}。` : ""
          }空仓也是一种计划，规则变严不是为了保证赚钱。`
        : `观察池 ${stats.pool} 只，拉到日K ${stats.fetched} 只，硬规则通过 ${stats.passed} 只，按结构取前 ${candidates.length} 只。候选来自本机代拉的公开延迟日K（腾讯优先，不通则新浪）。这是纪律过滤，不是胜率榜，更不是投资建议。`;

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
      scanStats: stats,
    };
  } finally {
    clearTimeout(timer);
  }
}
