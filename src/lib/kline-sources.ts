import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type DailyBar,
  type StockKline,
  tencentKlineUrl,
  tencentSymbol,
} from "@/lib/public-kline";
import {
  isSourceCircuitOpen,
  type UpstreamSource,
  withPoliteSource,
} from "@/lib/polite-fetch";

const execFileAsync = promisify(execFile);

const BROWSERISH = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0",
};

type SinaBar = { day: string; open: string; high: string; low: string; close: string; volume: string };

function normalizeName(name: string): string {
  return name.replace(/Ａ/g, "A").replace(/Ｂ/g, "B").trim();
}

function isTencentKline(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const data = (json as { data?: unknown }).data;
  return Boolean(data && typeof data === "object");
}

function isSinaKline(json: unknown): json is SinaBar[] {
  return Array.isArray(json) && json.length >= 12 && typeof json[0]?.day === "string" && json[0].close != null;
}

function toBar(raw: unknown, prevClose?: number): DailyBar | null {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(",");
  if (parts.length < 6) return null;
  const open = Number(parts[1]);
  const close = Number(parts[2]);
  const high = Number(parts[3]);
  const low = Number(parts[4]);
  const volume = Number(parts[5]);
  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(volume)) return null;
  const changePct =
    prevClose && prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
  return { date: parts[0], open, close, high, low, volume, changePct };
}

export function parseTencentShapedKline(code: string, json: unknown): StockKline | null {
  const symbol = tencentSymbol(code);
  const row = (json as {
    data?: Record<string, { qfqday?: unknown[]; day?: unknown[]; qt?: Record<string, string[]> }>;
  })?.data?.[symbol];
  const raw = row?.qfqday ?? row?.day ?? [];
  if (!Array.isArray(raw) || raw.length < 12) return null;
  const bars: DailyBar[] = [];
  for (const item of raw) {
    const bar = toBar(item, bars.at(-1)?.close);
    if (bar) bars.push(bar);
  }
  if (bars.length < 12) return null;
  const name = normalizeName(row?.qt?.[symbol]?.[1] ?? code);
  return { code, name, bars };
}

function parseSinaKline(code: string, rows: SinaBar[], name: string): StockKline | null {
  const bars: DailyBar[] = [];
  for (const row of rows) {
    const open = Number(row.open);
    const close = Number(row.close);
    const high = Number(row.high);
    const low = Number(row.low);
    const volume = Number(row.volume) / 100;
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(volume)) continue;
    const prev = bars.at(-1)?.close;
    const changePct = prev && prev > 0 ? ((close - prev) / prev) * 100 : 0;
    bars.push({ date: row.day, open, high, low, close, volume, changePct });
  }
  if (bars.length < 12) return null;
  return { code, name: normalizeName(name), bars };
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ json: unknown; status: number } | null> {
  try {
    const response = await fetch(url, { signal, cache: "no-store", headers });
    const status = response.status;
    if (!response.ok) return { json: null, status };
    const json: unknown = await response.json();
    return { json, status };
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

function sinaUrl(code: string): string {
  const symbol = tencentSymbol(code);
  return `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=30`;
}

async function fetchQuoteName(code: string): Promise<string> {
  const symbol = tencentSymbol(code);
  try {
    const response = await fetch(`https://qt.gtimg.cn/q=${symbol}`, {
      cache: "no-store",
      headers: BROWSERISH,
    });
    if (!response.ok) return code;
    const text = new TextDecoder("gbk").decode(await response.arrayBuffer());
    const parts = text.split("~");
    return parts[1]?.trim() || code;
  } catch {
    return code;
  }
}

export type SourceFetchResult =
  | { ok: true; kline: StockKline; via: UpstreamSource; status?: number }
  | { ok: false; via: UpstreamSource; error: string; status?: number; hard?: boolean };

async function fetchTencentDirect(code: string, signal?: AbortSignal): Promise<SourceFetchResult> {
  const url = tencentKlineUrl(code);
  const node = await fetchJson(url, BROWSERISH, signal);
  if (node?.json && isTencentKline(node.json)) {
    const kline = parseTencentShapedKline(code, node.json);
    if (kline) return { ok: true, kline, via: "tencent", status: node.status };
  }
  const curled = await curlJson(url);
  if (curled && isTencentKline(curled)) {
    const kline = parseTencentShapedKline(code, curled);
    if (kline) return { ok: true, kline, via: "tencent" };
  }
  const status = node?.status;
  const hard = status === 403 || status === 429 || status === 501;
  return {
    ok: false,
    via: "tencent",
    error: status ? `腾讯 HTTP ${status}` : "腾讯日K没拉到",
    status,
    hard,
  };
}

async function fetchSinaDirect(code: string, signal?: AbortSignal): Promise<SourceFetchResult> {
  const headers = { ...BROWSERISH, Referer: "https://finance.sina.com.cn" };
  const node = await fetchJson(sinaUrl(code), headers, signal);
  let rows: SinaBar[] | null =
    node?.json && isSinaKline(node.json) ? node.json : null;
  if (!rows) {
    const raw = await curlJson(sinaUrl(code), ["-H", "Referer: https://finance.sina.com.cn"]);
    rows = isSinaKline(raw) ? raw : null;
  }
  if (!rows) {
    const status = node?.status;
    const hard = status === 403 || status === 429;
    return {
      ok: false,
      via: "sina",
      error: status ? `新浪 HTTP ${status}` : "新浪日K没拉到",
      status,
      hard,
    };
  }
  const name = await fetchQuoteName(code);
  const kline = parseSinaKline(code, rows, name);
  if (!kline) {
    return { ok: false, via: "sina", error: "新浪日K根数不够", status: node?.status };
  }
  return { ok: true, kline, via: "sina", status: node?.status };
}

export function preferredKlineSource(code: string): UpstreamSource {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "tencent" : "sina";
}

export function otherKlineSource(source: UpstreamSource): UpstreamSource {
  return source === "tencent" ? "sina" : "tencent";
}

async function fetchFromSource(
  source: UpstreamSource,
  code: string,
  signal?: AbortSignal,
): Promise<SourceFetchResult> {
  if (isSourceCircuitOpen(source)) {
    return { ok: false, via: source, error: `${source} 熔断中`, hard: true };
  }
  try {
    return await withPoliteSource(source, async () => {
      const result =
        source === "tencent" ? await fetchTencentDirect(code, signal) : await fetchSinaDirect(code, signal);
      if (result.ok) {
        const { notePoliteSuccess } = await import("@/lib/polite-fetch");
        notePoliteSuccess(source);
      } else {
        const { notePoliteFailure } = await import("@/lib/polite-fetch");
        notePoliteFailure(source, Boolean(result.hard));
      }
      return result;
    });
  } catch (error) {
    const { notePoliteFailure } = await import("@/lib/polite-fetch");
    notePoliteFailure(source, true);
    return {
      ok: false,
      via: source,
      error: error instanceof Error ? error.message : "上游请求失败",
      hard: true,
    };
  }
}

/** Preferred source, then at most one failover. Both go through polite limiter. */
export async function fetchKlineSharded(
  code: string,
  signal?: AbortSignal,
): Promise<SourceFetchResult> {
  const primary = preferredKlineSource(code);
  const first = await fetchFromSource(primary, code, signal);
  if (first.ok) return first;
  const secondary = otherKlineSource(primary);
  if (isSourceCircuitOpen(secondary)) return first;
  const second = await fetchFromSource(secondary, code, signal);
  return second.ok ? second : first.error ? first : second;
}
