export type DailyBar = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  changePct: number;
};

export type StockKline = {
  code: string;
  name: string;
  bars: DailyBar[];
};

function normalizeName(name: string): string {
  return name.replace(/Ａ/g, "A").replace(/Ｂ/g, "B").trim();
}

export function tencentSymbol(code: string): string {
  return code.startsWith("6") ? `sh${code}` : `sz${code}`;
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

export async function fetchDailyKline(code: string, signal?: AbortSignal): Promise<StockKline | null> {
  const symbol = tencentSymbol(code);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,30,qfq`;
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    data?: Record<
      string,
      { qfqday?: unknown[]; day?: unknown[]; qt?: Record<string, string[]> }
    >;
  };
  const row = json.data?.[symbol];
  const raw = row?.qfqday ?? row?.day ?? [];
  if (raw.length < 12) return null;
  const bars: DailyBar[] = [];
  for (const item of raw) {
    const bar = toBar(item, bars.at(-1)?.close);
    if (bar) bars.push(bar);
  }
  if (bars.length < 12) return null;
  const name = normalizeName(row?.qt?.[symbol]?.[1] ?? code);
  return { code, name, bars };
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
