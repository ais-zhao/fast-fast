import { disableProcessProxy } from "@/lib/direct-net";
import { chinaTodayISO, previousTradingDay, sessionMeta } from "@/lib/market";
import { fetchAShareSnapshots } from "@/lib/market-list";
import { fetchKlineSharded, preferredKlineSource } from "@/lib/kline-sources";
import {
  closeKlineDb,
  klineCoverage,
  listCodesNeedingWarm,
  listFailSamples,
  markKlineFail,
  upsertKline,
} from "@/lib/kline-store";
import { configurePoliteSource, politeSourceStatus } from "@/lib/polite-fetch";
import { cheapSkip } from "@/lib/snapshot-filter";

disableProcessProxy();

export type WarmOptions = {
  limit?: number;
  includeFail?: boolean;
  signal?: AbortSignal;
  onProgress?: (info: {
    done: number;
    total: number;
    code: string;
    ok: boolean;
    via?: string;
    error?: string;
  }) => void;
};

export type WarmResult = {
  attempted: number;
  saved: number;
  failed: number;
  skippedFresh: number;
  coverage: ReturnType<typeof klineCoverage>;
  sources: ReturnType<typeof politeSourceStatus>;
  failSamples: { code: string; name: string }[];
  listVia: string;
};

export async function warmKlineLibrary(options: WarmOptions = {}): Promise<WarmResult> {
  configurePoliteSource("tencent", { concurrency: 2, minIntervalMs: 550, batchSize: 50 });
  configurePoliteSource("sina", { concurrency: 2, minIntervalMs: 550, batchSize: 50 });

  const listed = await fetchAShareSnapshots(options.signal);
  if (!listed || listed.rows.length < 80) {
    throw new Error(
      "沪深A股全市场快照没拉到（AKShare/东财/新浪都失败）。填库不会改用 40 只备用池。请检查代理（常见 127.0.0.1:7890）、pip install -r requirements.txt，再跑 python3 scripts/akshare_spot.py。",
    );
  }
  const rows = listed.rows;
  const universe = rows.map((row) => ({
    code: row.code,
    name: row.name,
  }));
  const snapshotByCode = new Map(rows.map((row) => [row.code, row]));
  const minLastDate = sessionMeta().asOf;
  const pendingAll = listCodesNeedingWarm({
    universe,
    minLastDate,
    minBars: 20,
    includeFail: options.includeFail ?? true,
  });
  // Prefer names that already pass the cheap snapshot screen so desk can review sooner.
  pendingAll.sort((a, b) => {
    const sa = snapshotByCode.get(a.code);
    const sb = snapshotByCode.get(b.code);
    const pa = sa && !cheapSkip(sa) ? 0 : 1;
    const pb = sb && !cheapSkip(sb) ? 0 : 1;
    return pa - pb;
  });
  const skippedFresh = universe.length - pendingAll.length;
  const pending = typeof options.limit === "number" ? pendingAll.slice(0, options.limit) : pendingAll;

  let saved = 0;
  let failed = 0;
  let done = 0;

  for (const item of pending) {
    if (options.signal?.aborted) break;
    const result = await fetchKlineSharded(item.code, options.signal);
    done += 1;
    if (result.ok) {
      upsertKline(result.kline, result.via);
      saved += 1;
      options.onProgress?.({
        done,
        total: pending.length,
        code: item.code,
        ok: true,
        via: result.via,
      });
    } else {
      markKlineFail(item.code, item.name);
      failed += 1;
      options.onProgress?.({
        done,
        total: pending.length,
        code: item.code,
        ok: false,
        error: result.error,
      });
    }
  }

  return {
    attempted: pending.length,
    saved,
    failed,
    skippedFresh,
    coverage: klineCoverage(),
    sources: politeSourceStatus(),
    failSamples: listFailSamples(8),
    listVia: listed.via,
  };
}

export function warmStatusPayload() {
  const today = chinaTodayISO();
  return {
    asOfHint: previousTradingDay(today),
    coverage: klineCoverage(),
    sources: politeSourceStatus(),
    failSamples: listFailSamples(8),
    note: "填库请跑 npm run kline:warm。盘中 /api/desk 只读本地库，不会批量打公开源。优先铺快筛可能过关的票。快照失败时不会静默改用 40 只备用池。",
  };
}

export function preferredSourceFor(code: string) {
  return preferredKlineSource(code);
}

export function shutdownKlineWarm() {
  closeKlineDb();
}
