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
};

export function cheapSkip(row: SnapshotQuote): ScanSkipReason | null {
  if (row.name.includes("ST")) return "st";
  if (row.last * LOT_SIZE > MAX_PER_STOCK) return "lot";
  if (row.volumeRatio != null && row.volumeRatio < MIN_VOLUME_RATIO) return "volume-low";
  if (row.volumeRatio != null && row.volumeRatio > MAX_VOLUME_RATIO) return "volume-climax";
  if (row.changePct >= limitUpThreshold(row.board)) return "limit-up";
  if (row.changePct >= MAX_DAY_GAIN) return "day-gain";
  return null;
}

export function snapshotScore(row: SnapshotQuote): number {
  const vr = row.volumeRatio;
  const vrScore = vr == null ? 0.6 : 1 - Math.min(1, Math.abs(vr - 1.65) / 1.45);
  const gain = row.changePct;
  const gainScore = gain >= 0 && gain < 3 ? 1 : gain >= 0 && gain < 5 ? 0.55 : 0.2;
  return vrScore * 70 + gainScore * 30;
}

export function asSnapshot(input: {
  code: string;
  name: string;
  last: number;
  changePct: number;
  volumeRatio: number | null;
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
  };
}
