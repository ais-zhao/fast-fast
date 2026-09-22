import { NextResponse } from "next/server";
import { getDeskPayload } from "@/lib/mock-data";
import { scanDelayedDesk } from "@/lib/scan";
import type { MarketScene } from "@/lib/types";

export const dynamic = "force-dynamic";

function heldCodesFrom(request: Request): string[] {
  const url = new URL(request.url);
  return (url.searchParams.get("held") ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => /^\d{6}$/.test(code))
    .slice(0, 3);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scene = (url.searchParams.get("scene") ?? "ok") as MarketScene;
  const held = heldCodesFrom(request);

  if (scene === "error") {
    return NextResponse.json(
      { error: "公开延迟行情暂时中断。这是演示用的失败状态，可以改用离线演示继续纸上推演。" },
      { status: 503 },
    );
  }

  if (scene === "empty") {
    const payload = getDeskPayload("empty");
    payload.notice =
      "演示：扫描结果为空。真实延迟扫描也会在没有符合规则的票时这样显示，不必硬找。";
    return NextResponse.json(payload);
  }

  try {
    return NextResponse.json(await scanDelayedDesk(held));
  } catch {
    const fallback = getDeskPayload("ok");
    fallback.notice =
      "公开延迟行情暂不可用，已自动改用离线演示数据。不是实时行情，也不是投资建议。";
    return NextResponse.json(fallback);
  }
}
