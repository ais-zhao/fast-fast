import { NextResponse } from "next/server";
import { tencentKlineUrl } from "@/lib/public-kline";

export const dynamic = "force-dynamic";

const UPSTREAM_HEADERS = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0",
};

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "股票代码无效。" }, { status: 400 });
  }

  const upstream = tencentKlineUrl(code);
  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: UPSTREAM_HEADERS,
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "腾讯日K上游失败。", status: response.status, upstream },
        { status: 502 },
      );
    }
    const json: unknown = await response.json();
    return NextResponse.json(json, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "连不上腾讯日K上游。", upstream }, { status: 502 });
  }
}
