import { NextResponse } from "next/server";
import { warmStatusPayload } from "@/lib/kline-warm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(warmStatusPayload(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取日K库失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
