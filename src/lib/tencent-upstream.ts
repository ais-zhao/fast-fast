import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tencentKlineUrl, tencentSymbol } from "@/lib/public-kline";

const execFileAsync = promisify(execFile);

const BROWSERISH = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0",
};

function isTencentKline(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const data = (json as { data?: unknown }).data;
  return Boolean(data && typeof data === "object");
}

type SinaBar = { day: string; open: string; high: string; low: string; close: string; volume: string };

function isSinaKline(json: unknown): json is SinaBar[] {
  return Array.isArray(json) && json.length >= 12 && typeof json[0]?.day === "string" && json[0].close != null;
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

function sinaToTencentShape(code: string, rows: SinaBar[], name: string) {
  const symbol = tencentSymbol(code);
  return {
    code: 0,
    msg: "",
    via: "sina",
    data: {
      [symbol]: {
        qfqday: rows.map((row) => [
          row.day,
          row.open,
          row.close,
          row.high,
          row.low,
          String(Number(row.volume) / 100),
        ]),
        qt: { [symbol]: ["", name, code] },
      },
    },
  };
}

function sinaUrl(code: string): string {
  const symbol = tencentSymbol(code);
  return `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=30`;
}

export async function fetchTencentRaw(
  code: string,
  signal?: AbortSignal,
): Promise<{ json: unknown; via: "fetch" | "curl" | "sina" } | { error: string; status?: number }> {
  const tencentUrl = tencentKlineUrl(code);
  const node = await fetchJson(tencentUrl, BROWSERISH, signal);
  if (node?.json && isTencentKline(node.json)) {
    return { json: node.json, via: "fetch" };
  }
  const curled = await curlJson(tencentUrl);
  if (curled && isTencentKline(curled)) {
    return { json: curled, via: "curl" };
  }

  const sinaHeaders = { ...BROWSERISH, Referer: "https://finance.sina.com.cn" };
  const sinaNode = await fetchJson(sinaUrl(code), sinaHeaders, signal);
  const sinaRows =
    sinaNode?.json && isSinaKline(sinaNode.json)
      ? sinaNode.json
      : await (async () => {
          const raw = await curlJson(sinaUrl(code), ["-H", "Referer: https://finance.sina.com.cn"]);
          return isSinaKline(raw) ? raw : null;
        })();
  if (sinaRows) {
    const name = await fetchQuoteName(code);
    return { json: sinaToTencentShape(code, sinaRows, name), via: "sina" };
  }

  return {
    error: node ? `腾讯返回 HTTP ${node.status}，新浪日K也没拉到` : "腾讯和新浪日K都没拉到",
    status: node?.status,
  };
}
