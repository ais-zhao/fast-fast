import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { DailyBar, StockKline } from "@/lib/public-kline";

export type KlineMetaStatus = "ok" | "fail" | "pending";
export type KlineVia = "tencent" | "sina";

export type KlineMeta = {
  code: string;
  name: string;
  via: KlineVia | null;
  barCount: number;
  lastDate: string | null;
  updatedAt: string | null;
  status: KlineMetaStatus;
};

export type KlineCoverage = {
  path: string;
  totalMeta: number;
  ok: number;
  fail: number;
  pending: number;
  barRows: number;
};

const DEFAULT_DB = path.join(process.cwd(), "data", "kline.sqlite");

let dbSingleton: Database.Database | null = null;

export function klineDbPath(): string {
  return process.env.KLINE_DB_PATH?.trim() || DEFAULT_DB;
}

export function openKlineDb(dbPath = klineDbPath()): Database.Database {
  if (dbSingleton && klineDbPath() === dbPath) return dbSingleton;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bars (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS meta (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      via TEXT,
      bar_count INTEGER NOT NULL DEFAULT 0,
      last_date TEXT,
      updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_meta_status ON meta(status);
    CREATE INDEX IF NOT EXISTS idx_meta_last_date ON meta(last_date);
  `);
  if (klineDbPath() === dbPath) dbSingleton = db;
  return db;
}

export function closeKlineDb() {
  if (!dbSingleton) return;
  dbSingleton.close();
  dbSingleton = null;
}

function rowToBar(
  row: { date: string; open: number; high: number; low: number; close: number; volume: number },
  prevClose?: number,
): DailyBar {
  const changePct =
    prevClose && prevClose > 0 ? ((row.close - prevClose) / prevClose) * 100 : 0;
  return {
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    changePct,
  };
}

export function upsertKline(
  kline: StockKline,
  via: KlineVia,
  keepBars = 30,
): void {
  const db = openKlineDb();
  const bars = kline.bars.slice(-keepBars);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM bars WHERE code = ?").run(kline.code);
    const insert = db.prepare(
      `INSERT INTO bars (code, date, open, high, low, close, volume)
       VALUES (@code, @date, @open, @high, @low, @close, @volume)`,
    );
    for (const bar of bars) {
      insert.run({
        code: kline.code,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    }
    db.prepare(
      `INSERT INTO meta (code, name, via, bar_count, last_date, updated_at, status)
       VALUES (@code, @name, @via, @bar_count, @last_date, @updated_at, 'ok')
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name,
         via = excluded.via,
         bar_count = excluded.bar_count,
         last_date = excluded.last_date,
         updated_at = excluded.updated_at,
         status = 'ok'`,
    ).run({
      code: kline.code,
      name: kline.name,
      via,
      bar_count: bars.length,
      last_date: bars.at(-1)?.date ?? null,
      updated_at: new Date().toISOString(),
    });
  });
  tx();
}

export function markKlineFail(code: string, name = code): void {
  const db = openKlineDb();
  db.prepare(
    `INSERT INTO meta (code, name, via, bar_count, last_date, updated_at, status)
     VALUES (@code, @name, NULL, 0, NULL, @updated_at, 'fail')
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name,
       updated_at = excluded.updated_at,
       status = 'fail'`,
  ).run({
    code,
    name,
    updated_at: new Date().toISOString(),
  });
}

export function ensurePendingMeta(codes: { code: string; name: string }[]): void {
  const db = openKlineDb();
  const stmt = db.prepare(
    `INSERT INTO meta (code, name, status)
     VALUES (?, ?, 'pending')
     ON CONFLICT(code) DO UPDATE SET
       name = CASE WHEN excluded.name != excluded.code THEN excluded.name ELSE meta.name END`,
  );
  const tx = db.transaction((rows: { code: string; name: string }[]) => {
    for (const row of rows) stmt.run(row.code, row.name);
  });
  tx(codes);
}

export function getKlineMeta(code: string): KlineMeta | null {
  const db = openKlineDb();
  const row = db
    .prepare(
      `SELECT code, name, via, bar_count as barCount, last_date as lastDate,
              updated_at as updatedAt, status
       FROM meta WHERE code = ?`,
    )
    .get(code) as
    | {
        code: string;
        name: string;
        via: string | null;
        barCount: number;
        lastDate: string | null;
        updatedAt: string | null;
        status: KlineMetaStatus;
      }
    | undefined;
  if (!row) return null;
  return {
    ...row,
    via: row.via === "tencent" || row.via === "sina" ? row.via : null,
  };
}

export function loadKlineFromStore(code: string): StockKline | null {
  const db = openKlineDb();
  const meta = getKlineMeta(code);
  if (!meta || meta.status !== "ok") return null;
  const rows = db
    .prepare(
      `SELECT date, open, high, low, close, volume
       FROM bars WHERE code = ? ORDER BY date ASC`,
    )
    .all(code) as Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  if (rows.length < 12) return null;
  const bars: DailyBar[] = [];
  for (const row of rows) {
    bars.push(rowToBar(row, bars.at(-1)?.close));
  }
  return { code, name: meta.name || code, bars };
}

export function listCodesNeedingWarm(options: {
  universe: { code: string; name: string }[];
  minLastDate: string;
  minBars?: number;
  includeFail?: boolean;
}): { code: string; name: string }[] {
  const minBars = options.minBars ?? 20;
  ensurePendingMeta(options.universe);
  const db = openKlineDb();
  const metaRows = db
    .prepare(
      `SELECT code, name, status, bar_count as barCount, last_date as lastDate
       FROM meta`,
    )
    .all() as Array<{
    code: string;
    name: string;
    status: KlineMetaStatus;
    barCount: number;
    lastDate: string | null;
  }>;
  const byCode = new Map(metaRows.map((row) => [row.code, row]));
  const need: { code: string; name: string }[] = [];
  for (const item of options.universe) {
    const meta = byCode.get(item.code);
    if (
      meta &&
      meta.status === "ok" &&
      meta.barCount >= minBars &&
      meta.lastDate &&
      meta.lastDate >= options.minLastDate
    ) {
      continue;
    }
    if (meta?.status === "fail" && options.includeFail === false) continue;
    need.push({ code: item.code, name: item.name || meta?.name || item.code });
  }
  return need;
}

export function klineCoverage(): KlineCoverage {
  const db = openKlineDb();
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) as totalMeta,
         SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok,
         SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as fail,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM meta`,
    )
    .get() as { totalMeta: number; ok: number; fail: number; pending: number };
  const barRows = (db.prepare(`SELECT COUNT(*) as n FROM bars`).get() as { n: number }).n;
  return {
    path: klineDbPath(),
    totalMeta: counts.totalMeta ?? 0,
    ok: counts.ok ?? 0,
    fail: counts.fail ?? 0,
    pending: counts.pending ?? 0,
    barRows,
  };
}

export function listFailSamples(limit = 8): { code: string; name: string }[] {
  const db = openKlineDb();
  return db
    .prepare(
      `SELECT code, name FROM meta WHERE status = 'fail' ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as { code: string; name: string }[];
}
