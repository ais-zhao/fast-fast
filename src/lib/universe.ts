import type { Board } from "@/lib/types";

/** Liquid main/ChiNext names; one lot should usually fit the 20k cap. No 科创、北交所. */
export const SCAN_UNIVERSE: { code: string; board: Board }[] = [
  { code: "000001", board: "主板" },
  { code: "000002", board: "主板" },
  { code: "000063", board: "主板" },
  { code: "000333", board: "主板" },
  { code: "000338", board: "主板" },
  { code: "000425", board: "主板" },
  { code: "000538", board: "主板" },
  { code: "000568", board: "主板" },
  { code: "000651", board: "主板" },
  { code: "000725", board: "主板" },
  { code: "000858", board: "主板" },
  { code: "002027", board: "主板" },
  { code: "002142", board: "主板" },
  { code: "002230", board: "主板" },
  { code: "002241", board: "主板" },
  { code: "002415", board: "主板" },
  { code: "002475", board: "主板" },
  { code: "300014", board: "创业板" },
  { code: "300015", board: "创业板" },
  { code: "300033", board: "创业板" },
  { code: "300059", board: "创业板" },
  { code: "300124", board: "创业板" },
  { code: "300274", board: "创业板" },
  { code: "300408", board: "创业板" },
  { code: "300433", board: "创业板" },
  { code: "300498", board: "创业板" },
  { code: "600036", board: "主板" },
  { code: "600031", board: "主板" },
  { code: "600276", board: "主板" },
  { code: "600309", board: "主板" },
  { code: "600519", board: "主板" },
  { code: "600887", board: "主板" },
  { code: "600900", board: "主板" },
  { code: "601012", board: "主板" },
  { code: "601088", board: "主板" },
  { code: "601138", board: "主板" },
  { code: "601166", board: "主板" },
  { code: "601318", board: "主板" },
  { code: "601668", board: "主板" },
  { code: "601888", board: "主板" },
];

export function eastMoneySecid(code: string): string {
  return code.startsWith("6") ? `1.${code}` : `0.${code}`;
}

export function limitUpThreshold(board: Board): number {
  return board === "创业板" ? 19.5 : 9.5;
}
