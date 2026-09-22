import { fetchAShareSnapshots } from "@/lib/market-list";
import { fetchDailyKline, mapPool } from "@/lib/public-kline";
import { sessionMeta } from "@/lib/market";
import { toOhlcBar } from "@/lib/quotes";
import {
  MAX_CANDIDATES,
  MAX_KLINE_POOL,
  bumpSkip,
  bumpSkipCount,
  emptyScanStats,
} from "@/lib/scan-constants";
import { evaluateSetup, topSkipLines } from "@/lib/scan-rules";
import { cheapSkip, snapshotScore, type SnapshotQuote } from "@/lib/snapshot-filter";
import type { Candidate, DeskPayload, QuoteBook } from "@/lib/types";
import { SCAN_UNIVERSE, boardFromCode } from "@/lib/universe";

function fallbackPool(): SnapshotQuote[] {
  return SCAN_UNIVERSE.map((item) => ({
    code: item.code,
    name: item.code,
    board: item.board,
    last: 1,
    changePct: 0,
    volumeRatio: null,
  }));
}

export async function scanDelayedDesk(heldCodes: string[] = []): Promise<DeskPayload> {
  const meta = sessionMeta();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);

  try {
    const listed = await fetchAShareSnapshots(controller.signal);
    const snapshots = listed?.rows ?? fallbackPool();
    const stats = emptyScanStats(listed?.total ?? snapshots.length);
    stats.listVia = listed?.via ?? "fallback-40";

    const shortlist: SnapshotQuote[] = [];
    for (const row of snapshots) {
      const reason = cheapSkip(row);
      if (reason) {
        bumpSkip(stats, reason, { code: row.code, name: row.name });
        continue;
      }
      shortlist.push(row);
    }

    if (listed && listed.total > listed.scanned) {
      bumpSkipCount(stats, "volume-low", listed.total - listed.scanned);
    }

    stats.shortlisted = shortlist.length;
    shortlist.sort((a, b) => snapshotScore(b) - snapshotScore(a));
    bumpSkipCount(stats, "kline-cap", Math.max(0, shortlist.length - MAX_KLINE_POOL));

    const extraHeld = heldCodes
      .filter((code) => /^\d{6}$/.test(code))
      .map((code) => {
        const existing = snapshots.find((row) => row.code === code) ?? shortlist.find((row) => row.code === code);
        if (existing) return existing;
        const board = boardFromCode(code);
        if (!board) return null;
        return {
          code,
          name: code,
          board,
          last: 1,
          changePct: 0,
          volumeRatio: null,
        } satisfies SnapshotQuote;
      })
      .filter((row): row is SnapshotQuote => row !== null);

    const klineTargets: SnapshotQuote[] = [];
    const seen = new Set<string>();
    for (const row of [...extraHeld, ...shortlist.slice(0, MAX_KLINE_POOL)]) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      klineTargets.push(row);
    }

    const fetched = await mapPool(klineTargets, 8, async (item) => {
      try {
        const kline = await fetchDailyKline(item.code, controller.signal);
        if (!kline) {
          bumpSkip(stats, "fetch-fail", { code: item.code, name: item.name });
          return { kline: null, candidate: null };
        }
        stats.fetched += 1;
        const evaluated = evaluateSetup(kline, item.board);
        if (!evaluated.ok) {
          bumpSkip(stats, evaluated.reason, { code: kline.code, name: kline.name });
          return { kline, candidate: null };
        }
        stats.passed += 1;
        return { kline, candidate: evaluated.candidate };
      } catch {
        bumpSkip(stats, "fetch-fail", { code: item.code, name: item.name });
        return { kline: null, candidate: null };
      }
    });

    const gotBars = fetched.filter((row) => row.kline).length;
    if (gotBars < 5 && stats.listVia === "fallback-40") {
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
    const listLabel =
      stats.listVia === "eastmoney" ? "东方财富快照" : stats.listVia === "sina" ? "新浪行情列表" : "40 只备用池";
    const notice =
      candidates.length === 0
        ? `沪深A股约 ${stats.pool} 只（${listLabel}），快筛留下 ${stats.shortlisted} 只，日K复核 ${stats.fetched} 只，硬规则一只都没放过。${
            skipHint ? `主要挡掉：${skipHint}。` : ""
          }空仓也是一种计划，全市场扫描不是保证赚钱。`
        : `沪深A股约 ${stats.pool} 只（${listLabel}），快筛留下 ${stats.shortlisted} 只，日K复核 ${stats.fetched} 只，硬规则通过 ${stats.passed} 只，按结构取前 ${candidates.length} 只。这是纪律过滤，不是胜率榜，更不是投资建议。`;

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
