import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { mapPool, tencentSymbol } from "@/lib/public-kline";
import { asSnapshot, type SnapshotQuote } from "@/lib/snapshot-filter";

const execFileAsync = promisify(execFile);

const BROWSERISH = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0",
};

export type MarketListVia = "akshare" | "eastmoney" | "sina";

export type MarketListResult = {
  rows: SnapshotQuote[];
  total: number;
  via: MarketListVia;
  scanned: number;
};

const EM_HOSTS = [
  "https://80.push2delay.eastmoney.com",
  "https://88.push2delay.eastmoney.com",
];
const EM_PAGE_SIZE = 100;
const EM_MAX_PAGES = 28;
const SINA_PAGE_SIZE = 100;
const SINA_MAX_PAGES = 40;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "-") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal, cache: "no-store", headers });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function curlJson(url: string, extraHeaders: string[] = []): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-m", "12", "--http1.1", "-H", "Accept: */*", "-H", "User-Agent: Mozilla/5.0", ...extraHeaders, url],
      { encoding: "utf8", maxBuffer: 5_000_000 },
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function loadJsonPreferCurl(
  url: string,
  headers: Record<string, string>,
  extraCurlHeaders: string[],
  signal?: AbortSignal,
): Promise<unknown | null> {
  const curled = await curlJson(url, extraCurlHeaders);
  if (curled) return curled;
  return fetchJson(url, headers, signal);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emUrl(host: string, page: number): string {
  return (
    `${host}/api/qt/clist/get?pn=${page}&pz=${EM_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f10` +
    `&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23` +
    `&fields=f2,f3,f8,f10,f12,f14`
  );
}

type EmPage = { total: number; rows: SnapshotQuote[] };

function parseEmPage(json: unknown): EmPage | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as { data?: { total?: number; diff?: unknown[] } }).data;
  const diff = data?.diff;
  if (!Array.isArray(diff)) return null;
  const rows: SnapshotQuote[] = [];
  for (const item of diff) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const last = toNumber(row.f2);
    const changePct = toNumber(row.f3);
    const volumeRatio = toNumber(row.f10);
    const turnoverRatio = toNumber(row.f8);
    const code = String(row.f12 ?? "");
    const name = String(row.f14 ?? code);
    if (last == null || changePct == null) continue;
    const parsed = asSnapshot({
      code,
      name,
      last,
      changePct,
      volumeRatio,
      turnoverRatio,
    });
    if (parsed) rows.push(parsed);
  }
  return { total: Number(data?.total) || rows.length, rows };
}

async function fetchEmPage(page: number, signal?: AbortSignal): Promise<EmPage | null> {
  const headers = { ...BROWSERISH, Referer: "https://quote.eastmoney.com/" };
  const curlHeaders = ["-H", "Referer: https://quote.eastmoney.com/"];
  for (const host of EM_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const json = await loadJsonPreferCurl(emUrl(host, page), headers, curlHeaders, signal);
      const parsed = parseEmPage(json);
      if (parsed && parsed.rows.length > 0) return parsed;
      await sleep(120 * (attempt + 1));
    }
  }
  return null;
}

async function fetchEastMoneyList(signal?: AbortSignal): Promise<MarketListResult | null> {
  const first = await fetchEmPage(1, signal);
  if (!first) return null;
  const total = first.total || 0;
  const pageCount = Math.min(EM_MAX_PAGES, Math.max(1, Math.ceil(total / EM_PAGE_SIZE)));
  const pages = await mapPool(
    Array.from({ length: pageCount }, (_, index) => index + 1),
    6,
    async (page) => (page === 1 ? first : fetchEmPage(page, signal)),
  );
  const byCode = new Map<string, SnapshotQuote>();
  for (const page of pages) {
    if (!page) continue;
    for (const row of page.rows) byCode.set(row.code, row);
  }
  if (byCode.size < 80) return null;
  return { rows: [...byCode.values()], total: total || byCode.size, via: "eastmoney", scanned: byCode.size };
}

type SinaRow = {
  symbol?: string;
  code?: string;
  name?: string;
  trade?: string;
  changepercent?: number | string;
  turnoverratio?: number | string;
};

function parseSinaRows(json: unknown): SnapshotQuote[] {
  if (!Array.isArray(json)) return [];
  const rows: SnapshotQuote[] = [];
  for (const item of json as SinaRow[]) {
    const symbol = String(item.symbol ?? "");
    if (symbol.startsWith("bj")) continue;
    const code = String(item.code ?? "").padStart(6, "0");
    const last = toNumber(item.trade);
    const changePct = toNumber(item.changepercent);
    if (last == null || changePct == null) continue;
    const parsed = asSnapshot({
      code,
      name: String(item.name ?? code),
      last,
      changePct,
      volumeRatio: null,
      turnoverRatio: toNumber(item.turnoverratio),
    });
    if (parsed) rows.push(parsed);
  }
  return rows;
}

async function fetchSinaCount(signal?: AbortSignal): Promise<number> {
  const headers = { ...BROWSERISH, Referer: "https://finance.sina.com.cn" };
  const json = await loadJsonPreferCurl(
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a",
    headers,
    ["-H", "Referer: https://finance.sina.com.cn"],
    signal,
  );
  const n = typeof json === "string" || typeof json === "number" ? Number(json) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sinaPageUrl(page: number): string {
  return (
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData" +
    `?page=${page}&num=${SINA_PAGE_SIZE}&sort=turnoverratio&asc=0&node=hs_a`
  );
}

async function fetchSinaPage(page: number, signal?: AbortSignal): Promise<SnapshotQuote[]> {
  const headers = { ...BROWSERISH, Referer: "https://finance.sina.com.cn" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const json = await loadJsonPreferCurl(sinaPageUrl(page), headers, ["-H", "Referer: https://finance.sina.com.cn"], signal);
    const rows = parseSinaRows(json);
    if (rows.length > 0) return rows;
    await sleep(120 * (attempt + 1));
  }
  return [];
}

async function fetchSinaList(signal?: AbortSignal): Promise<MarketListResult | null> {
  const counted = await fetchSinaCount(signal);
  const pageCount = Math.min(SINA_MAX_PAGES, Math.max(20, Math.ceil((counted || 5000) / SINA_PAGE_SIZE)));
  const pages = await mapPool(
    Array.from({ length: pageCount }, (_, index) => index + 1),
    6,
    (page) => fetchSinaPage(page, signal),
  );
  const byCode = new Map<string, SnapshotQuote>();
  for (const rows of pages) {
    for (const row of rows) byCode.set(row.code, row);
  }
  if (byCode.size < 80) return null;
  return {
    rows: [...byCode.values()],
    total: counted || byCode.size,
    via: "sina",
    scanned: byCode.size,
  };
}

export async function fetchAShareSnapshots(signal?: AbortSignal): Promise<MarketListResult | null> {
  const akshare = await fetchAkshareList();
  if (akshare && akshare.rows.length >= 80) return akshare;
  const east = await fetchEastMoneyList(signal);
  if (east && east.rows.length >= 80) return east;
  return fetchSinaList(signal);
}

type AksharePayload = {
  error?: string;
  via?: string;
  total?: number;
  rows?: Array<{
    code?: string;
    name?: string;
    last?: number;
    changePct?: number;
    volumeRatio?: number | null;
    turnoverRatio?: number | null;
  }>;
};

let akshareCache: { at: number; result: MarketListResult } | null = null;

async function fetchAkshareList(): Promise<MarketListResult | null> {
  const now = Date.now();
  if (akshareCache && now - akshareCache.at < 180_000) return akshareCache.result;
  try {
    const { stdout } = await execFileAsync("python3", [path.join(process.cwd(), "scripts/akshare_spot.py")], {
      timeout: 45_000,
      maxBuffer: 12_000_000,
      env: { ...process.env, TQDM_DISABLE: "1", PYTHONUNBUFFERED: "1" },
    });
    const payload = JSON.parse(stdout) as AksharePayload;
    if (payload.error || !Array.isArray(payload.rows)) return null;
    const rows: SnapshotQuote[] = [];
    for (const item of payload.rows) {
      const parsed = asSnapshot({
        code: String(item.code ?? ""),
        name: String(item.name ?? item.code ?? ""),
        last: Number(item.last),
        changePct: Number(item.changePct),
        volumeRatio: item.volumeRatio ?? null,
        turnoverRatio: item.turnoverRatio ?? null,
      });
      if (parsed) rows.push(parsed);
    }
    if (rows.length < 80) return null;
    const result = { rows, total: payload.total || rows.length, via: "akshare" as const, scanned: rows.length };
    akshareCache = { at: Date.now(), result };
    return result;
  } catch {
    return null;
  }
}

const TENCENT_VOLUME_RATIO_INDEX = 49;
const QUOTE_BATCH = 60;

async function loadQuoteText(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { signal, cache: "no-store", headers: BROWSERISH });
    if (response.ok) {
      return new TextDecoder("gbk").decode(await response.arrayBuffer());
    }
  } catch {
    // fall through to curl
  }
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-m", "10", "--http1.1", "-H", "User-Agent: Mozilla/5.0", url],
      { encoding: "buffer", maxBuffer: 2_000_000 },
    );
    return new TextDecoder("gbk").decode(stdout);
  } catch {
    return null;
  }
}

function parseTencentVolumeRatios(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const chunk of text.split(";")) {
    const start = chunk.indexOf('="');
    if (start < 0) continue;
    const inner = chunk.slice(start + 2).replace(/"\s*$/, "");
    const parts = inner.split("~");
    const code = (parts[2] ?? "").trim();
    const ratio = Number(parts[TENCENT_VOLUME_RATIO_INDEX]);
    if (/^\d{6}$/.test(code) && Number.isFinite(ratio) && ratio > 0) {
      found.set(code, Math.round(ratio * 100) / 100);
    }
  }
  return found;
}

export async function attachTencentVolumeRatio(
  rows: SnapshotQuote[],
  signal?: AbortSignal,
): Promise<number> {
  let attached = 0;
  for (let index = 0; index < rows.length; index += QUOTE_BATCH) {
    const batch = rows.slice(index, index + QUOTE_BATCH);
    const url = `https://qt.gtimg.cn/q=${batch.map((row) => tencentSymbol(row.code)).join(",")}`;
    const text = await loadQuoteText(url, signal);
    if (!text) continue;
    const ratios = parseTencentVolumeRatios(text);
    for (const row of batch) {
      const ratio = ratios.get(row.code);
      if (ratio == null) continue;
      row.volumeRatio = ratio;
      attached += 1;
    }
  }
  return attached;
}

