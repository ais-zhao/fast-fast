import { MAX_PER_STOCK, LOT_SIZE } from "@/lib/rules";
import {
  MAX_DAY_GAIN,
  MAX_VOLUME_RATIO,
  MIN_VOLUME_RATIO,
  type ScanSkipReason,
} from "@/lib/scan-constants";
import type { Board } from "@/lib/types";
import { boardFromCode, limitUpThreshold } from "@/lib/universe";

export type SnapshotQuote = {
  code: string;
  name: string;
  board: Board;
  last: number;
  changePct: number;
  volumeRatio: number | null;
  turnoverRatio: number | null;
};

export function cheapSkip(row: SnapshotQuote): ScanSkipReason | null {
  if (row.name.includes("ST")) return "st";
  if (/^[NC]/.test(row.name)) return "day-gain";
  if (row.last * LOT_SIZE > MAX_PER_STOCK) return "lot";
  if (row.volumeRatio != null && row.volumeRatio < MIN_VOLUME_RATIO) return "volume-low";
  if (row.volumeRatio != null && row.volumeRatio > MAX_VOLUME_RATIO) return "volume-climax";
  if (row.volumeRatio == null && row.turnoverRatio != null && row.turnoverRatio < 1.2) return "volume-low";
  if (row.volumeRatio == null && row.turnoverRatio != null && row.turnoverRatio > 12) return "volume-climax";
  if (row.changePct >= limitUpThreshold(row.board)) return "limit-up";
  if (row.changePct >= MAX_DAY_GAIN) return "day-gain";
  return null;
}

export function snapshotScore(row: SnapshotQuote): number {
  const vr = row.volumeRatio;
  const tr = row.turnoverRatio;
  const vrScore =
    vr != null
      ? vr >= 1.2 && vr <= 1.7
        ? 1
        : vr > 1.7 && vr <= 2.2
          ? 0.55
          : 0.2
      : tr != null
        ? 1 - Math.min(1, Math.abs(tr - 3.5) / 5)
        : 0.4;
  const gain = row.changePct;
  const gainScore =
    gain >= 0 && gain <= 1.8 ? 1 : gain > 1.8 && gain < 3.2 ? 0.45 : 0.15;
  return vrScore * 70 + gainScore * 30;
}

export function asSnapshot(input: {
  code: string;
  name: string;
  last: number;
  changePct: number;
  volumeRatio: number | null;
  turnoverRatio?: number | null;
}): SnapshotQuote | null {
  const board = boardFromCode(input.code);
  if (!board) return null;
  if (!Number.isFinite(input.last) || input.last <= 0) return null;
  return {
    code: input.code,
    name: input.name.replace(/Ａ/g, "A").replace(/Ｂ/g, "B").trim(),
    board,
    last: input.last,
    changePct: input.changePct,
    volumeRatio: input.volumeRatio,
    turnoverRatio: input.turnoverRatio ?? null,
  };
}
