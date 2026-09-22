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
import { SCAN_UNIVERSE } from "@/lib/universe";

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
};

function fallbackUniverse() {
  return SCAN_UNIVERSE.map((item) => ({ code: item.code, name: item.code }));
}

export async function warmKlineLibrary(options: WarmOptions = {}): Promise<WarmResult> {
  configurePoliteSource("tencent", { concurrency: 2, minIntervalMs: 550, batchSize: 50 });
  configurePoliteSource("sina", { concurrency: 2, minIntervalMs: 550, batchSize: 50 });

  const listed = await fetchAShareSnapshots(options.signal);
  const universe = (listed?.rows ?? fallbackUniverse()).map((row) => ({
    code: row.code,
    name: row.name,
  }));
  const minLastDate = sessionMeta().asOf;
  const pendingAll = listCodesNeedingWarm({
    universe,
    minLastDate,
    minBars: 20,
    includeFail: options.includeFail ?? true,
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

  const coverage = klineCoverage();
  const result: WarmResult = {
    attempted: pending.length,
    saved,
    failed,
    skippedFresh,
    coverage,
    sources: politeSourceStatus(),
    failSamples: listFailSamples(8),
  };
  return result;
}

export function warmStatusPayload() {
  const today = chinaTodayISO();
  return {
    asOfHint: previousTradingDay(today),
    coverage: klineCoverage(),
    sources: politeSourceStatus(),
    failSamples: listFailSamples(8),
    note: "填库请跑 npm run kline:warm。盘中 /api/desk 只读本地库，不会批量打公开源。",
  };
}

export function preferredSourceFor(code: string) {
  return preferredKlineSource(code);
}

export function shutdownKlineWarm() {
  closeKlineDb();
}
