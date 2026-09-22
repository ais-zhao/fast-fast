import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tencentKlineUrl } from "@/lib/public-kline";

const execFileAsync = promisify(execFile);

const UPSTREAM_HEADERS = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0",
};

function isKlinePayload(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const data = (json as { data?: unknown }).data;
  return Boolean(data && typeof data === "object");
}

async function fetchWithNode(url: string, signal?: AbortSignal): Promise<{ json: unknown; status: number } | null> {
  try {
    const response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: UPSTREAM_HEADERS,
    });
    const status = response.status;
    if (!response.ok) return { json: null, status };
    const json: unknown = await response.json();
    return { json, status };
  } catch {
    return null;
  }
}

async function fetchWithCurl(url: string): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-m", "12", "--http1.1", "-H", "Accept: */*", "-H", "User-Agent: Mozilla/5.0", url],
      { encoding: "utf8", maxBuffer: 5_000_000 },
    );
    const json: unknown = JSON.parse(stdout);
    return isKlinePayload(json) ? json : null;
  } catch {
    return null;
  }
}

export async function fetchTencentRaw(
  code: string,
  signal?: AbortSignal,
): Promise<{ json: unknown; via: "fetch" | "curl" } | { error: string; status?: number }> {
  const url = tencentKlineUrl(code);
  const node = await fetchWithNode(url, signal);
  if (node?.json && isKlinePayload(node.json)) {
    return { json: node.json, via: "fetch" };
  }
  const curled = await fetchWithCurl(url);
  if (curled) {
    return { json: curled, via: "curl" };
  }
  return {
    error: node ? `腾讯返回 HTTP ${node.status}` : "Node 和 curl 都没拉到腾讯日K",
    status: node?.status,
  };
}
