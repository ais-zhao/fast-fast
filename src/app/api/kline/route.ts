import { NextResponse } from "next/server";
import { fetchTencentRaw } from "@/lib/tencent-upstream";
import { tencentKlineUrl } from "@/lib/public-kline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "股票代码无效。" }, { status: 400 });
  }

  const upstream = tencentKlineUrl(code);
  const got = await fetchTencentRaw(code);
  if ("json" in got) {
    return NextResponse.json(got.json, {
      headers: {
        "Cache-Control": "no-store",
        "x-kline-via": got.via,
      },
    });
  }
  return NextResponse.json(
    { error: got.error, status: got.status, upstream },
    { status: 502 },
  );
}
