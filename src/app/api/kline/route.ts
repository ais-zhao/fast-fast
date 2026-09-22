import { NextResponse } from "next/server";
import { fetchKlineSharded, parseTencentShapedKline } from "@/lib/kline-sources";
import { loadKlineFromStore, upsertKline } from "@/lib/kline-store";
import { tencentKlineUrl, tencentSymbol, type StockKline } from "@/lib/public-kline";
import { fetchTencentRaw } from "@/lib/tencent-upstream";

export const dynamic = "force-dynamic";

function toTencentShape(kline: StockKline, via: string) {
  const symbol = tencentSymbol(kline.code);
  return {
    code: 0,
    msg: "",
    via,
    data: {
      [symbol]: {
        qfqday: kline.bars.map((bar) => [
          bar.date,
          String(bar.open),
          String(bar.close),
          String(bar.high),
          String(bar.low),
          String(bar.volume),
        ]),
        qt: { [symbol]: ["", kline.name, kline.code] },
      },
    },
  };
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "股票代码无效。" }, { status: 400 });
  }

  const upstream = tencentKlineUrl(code);
  const cached = loadKlineFromStore(code);
  if (cached) {
    return NextResponse.json(toTencentShape(cached, "cache"), {
      headers: { "Cache-Control": "no-store", "x-kline-via": "cache" },
    });
  }

  const sharded = await fetchKlineSharded(code);
  if (sharded.ok) {
    upsertKline(sharded.kline, sharded.via);
    return NextResponse.json(toTencentShape(sharded.kline, sharded.via), {
      headers: { "Cache-Control": "no-store", "x-kline-via": sharded.via },
    });
  }

  // Last resort: legacy path (still one stock, not bulk).
  const got = await fetchTencentRaw(code);
  if ("json" in got) {
    const parsed = parseTencentShapedKline(code, got.json);
    if (parsed) upsertKline(parsed, got.via === "sina" ? "sina" : "tencent");
    return NextResponse.json(got.json, {
      headers: {
        "Cache-Control": "no-store",
        "x-kline-via": got.via,
      },
    });
  }
  return NextResponse.json(
    { error: got.error, status: got.status, upstream, sharded: sharded.error },
    { status: 502 },
  );
}
