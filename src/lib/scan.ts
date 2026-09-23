import { attachTencentVolumeRatio, fetchAShareSnapshots } from "@/lib/market-list";
import { sessionMeta } from "@/lib/market";
import { toOhlcBar } from "@/lib/quotes";
import { klineCoverage, loadKlineFromStore } from "@/lib/kline-store";
import {
  MAX_CANDIDATES,
  bumpSkip,
  bumpSkipCount,
  emptyScanStats,
  klineCapNote,
} from "@/lib/scan-constants";
import { evaluateSetup, topSkipLines } from "@/lib/scan-rules";
import { cheapSkip, type SnapshotQuote } from "@/lib/snapshot-filter";
import type { Candidate, DeskPayload, QuoteBook } from "@/lib/types";
import type { StockKline } from "@/lib/public-kline";
import { boardFromCode } from "@/lib/universe";

export async function scanDelayedDesk(heldCodes: string[] = []): Promise<DeskPayload> {
  const meta = sessionMeta();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70_000);

  try {
    const listed = await fetchAShareSnapshots(controller.signal);
    if (!listed || listed.rows.length < 80) {
      throw new Error(
        "沪深A股全市场快照没拉到（AKShare/东财/新浪都失败）。未切离线演示时不会改用 40 只备用池。请检查代理（常见 127.0.0.1:7890）、pip install -r requirements.txt，并打开 /api/kline-cache。",
      );
    }
    const snapshots = listed.rows;
    const stats = emptyScanStats(listed.total);
    stats.listVia = listed.via;

    const coverage = klineCoverage();
    stats.cacheOk = coverage.ok;
    stats.cacheTotal = Math.max(coverage.totalMeta, snapshots.length);

    const shortlist: SnapshotQuote[] = [];
    for (const row of snapshots) {
      const reason = cheapSkip(row);
      if (reason) {
        bumpSkip(stats, reason, { code: row.code, name: row.name });
        continue;
      }
      shortlist.push(row);
    }

    if ((listed?.via === "eastmoney" || listed?.via === "akshare") && listed.total > listed.scanned) {
      bumpSkipCount(stats, "volume-low", listed.total - listed.scanned);
    }

    stats.shortlisted = shortlist.length;

    const missingVolume = shortlist.filter((row) => row.volumeRatio == null).slice(0, 480);
    if (missingVolume.length > 0) {
      await attachTencentVolumeRatio(missingVolume, controller.signal);
      const kept: SnapshotQuote[] = [];
      for (const row of shortlist) {
        const reason = cheapSkip(row);
        if (reason) {
          bumpSkip(stats, reason, { code: row.code, name: row.name });
          continue;
        }
        kept.push(row);
      }
      shortlist.length = 0;
      shortlist.push(...kept);
      stats.shortlisted = shortlist.length;
    }

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
          turnoverRatio: null,
        } satisfies SnapshotQuote;
      })
      .filter((row): row is SnapshotQuote => row !== null);

    const reviewSet = new Map<string, SnapshotQuote>();
    for (const row of shortlist) reviewSet.set(row.code, row);
    for (const row of extraHeld) reviewSet.set(row.code, row);

    const fetched: { kline: StockKline | null; candidate: Candidate | null }[] = [];

    for (const item of reviewSet.values()) {
      const cached = loadKlineFromStore(item.code);
      if (!cached) {
        bumpSkip(stats, "kline-cap", { code: item.code, name: item.name });
        fetched.push({ kline: null, candidate: null });
        continue;
      }
      if (item.name && item.name !== item.code) cached.name = item.name;
      stats.fetched += 1;
      stats.fromCache = (stats.fromCache ?? 0) + 1;
      const evaluated = evaluateSetup(cached, item.board);
      if (!evaluated.ok) {
        bumpSkip(stats, evaluated.reason, { code: cached.code, name: cached.name });
        fetched.push({ kline: cached, candidate: null });
        continue;
      }
      stats.passed += 1;
      fetched.push({ kline: cached, candidate: evaluated.candidate });
    }

    if (stats.shortlisted > 0 && stats.fetched === 0) {
      throw new Error(
        `本地日K库对快筛过关的 ${stats.shortlisted} 只尚未收录（未复核）。请先跑 npm run kline:warm，再刷新。未切离线演示时不会改用假数据。`,
      );
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
    const quotaNote = klineCapNote(stats);
    const coveragePct =
      stats.cacheTotal && stats.cacheTotal > 0
        ? Math.round(((stats.cacheOk ?? 0) / stats.cacheTotal) * 100)
        : 0;
    const coverageHint =
      coveragePct < 80
        ? `本地日K库覆盖约 ${coveragePct}%（${stats.cacheOk ?? 0}/${stats.cacheTotal ?? 0}），请先挂机跑 npm run kline:warm（限速、可中断续跑）。`
        : `本地日K库覆盖约 ${coveragePct}%（${stats.cacheOk ?? 0}/${stats.cacheTotal ?? 0}）。`;
    const ruleHint = skipHint ? `硬规则主要挡掉：${skipHint}。` : "";
    const listLabel =
      stats.listVia === "akshare"
        ? "AKShare 快照"
        : stats.listVia === "eastmoney"
          ? "东方财富快照"
          : "新浪行情列表";
    const notice =
      candidates.length === 0
        ? `沪深A股约 ${stats.pool} 只（${listLabel}），快筛留下 ${stats.shortlisted} 只，本地日K复核 ${stats.fetched} 只，硬规则一只都没放过。${coverageHint}${ruleHint}${quotaNote}空仓也是一种计划，全市场扫描不是保证赚钱。`
        : `沪深A股约 ${stats.pool} 只（${listLabel}），快筛留下 ${stats.shortlisted} 只，本地日K复核 ${stats.fetched} 只，硬规则通过 ${stats.passed} 只，按结构取前 ${candidates.length} 只。${coverageHint}${quotaNote}这是纪律过滤，不是胜率榜，更不是投资建议。`;

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
