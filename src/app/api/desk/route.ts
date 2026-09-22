import { NextResponse } from "next/server";
import { getDeskPayload } from "@/lib/mock-data";
import type { MarketScene } from "@/lib/types";

export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scene = (url.searchParams.get("scene") ?? "ok") as MarketScene;
  await sleep(420);

  if (scene === "error") {
    return NextResponse.json(
      { error: "模拟行情源暂时中断。这是演示用的失败状态，不是实盘断线。" },
      { status: 503 },
    );
  }

  const payload = getDeskPayload(scene === "empty" ? "empty" : "ok");
  return NextResponse.json(payload);
}
