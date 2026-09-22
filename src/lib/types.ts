export type Board = "主板" | "创业板";

export type MarketScene = "ok" | "empty" | "error";

export type DataSource = "delayed-public" | "offline-demo";

export type OhlcBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type QuoteBook = Record<string, OhlcBar[]>;

export type MarkContext = {
  dataSource: DataSource;
  quotes: QuoteBook;
};

export type Candidate = {
  code: string;
  name: string;
  board: Board;
  last: number;
  changePct: number;
  volumeRatio: number;
  ma5: number;
  ma10: number;
  consecutiveUpDays: number;
  limitUp: boolean;
  setupKind: string;
  setupScore: number;
  rewardRisk: number;
  targetPrice: number;
  suggestedStopPrice: number;
  extensionPct: number;
  reasons: string[];
  invalidateWhen: string[];
  suggestedStopPct: number;
  suggestedHoldDays: number;
  bar: OhlcBar;
  sourceUrl: string;
  upstreamUrl?: string;
};

export type DeskScanStats = {
  pool: number;
  fetched: number;
  passed: number;
  skipped: Partial<Record<string, number>>;
};

export type DeskPayload = {
  asOf: string;
  planFor: string;
  calendarToday: string;
  marketOpen: boolean;
  sessionLabel: string;
  candidates: Candidate[];
  notice: string;
  dataSource: DataSource;
  quotes: QuoteBook;
  scanStats?: DeskScanStats;
};

export type ExitReason = "stop" | "time" | "manual";

export type PaperPosition = {
  id: string;
  code: string;
  name: string;
  board: Board;
  lots: number;
  shares: number;
  entryPrice: number;
  cost: number;
  stopPrice: number;
  plannedHoldDays: number;
  entryReasons: string[];
  invalidateWhen: string[];
  openedOn: string;
  status: "open" | "closed";
  stopHitOn?: string;
  exitPrice?: number;
  exitOn?: string;
  exitReason?: ExitReason;
  heldDays?: number;
  pnl?: number;
  disciplineBreaks: string[];
  reviewNotes: string[];
};

export type PaperState = {
  sessionDate: string;
  cash: number;
  positions: PaperPosition[];
  closed: PaperPosition[];
};
