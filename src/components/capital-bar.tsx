import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMonthDay } from "@/lib/market";
import { formatYuanPlain, pnlClass } from "@/lib/format";
import { equity, investedAmount } from "@/lib/paper";
import {
  MAX_HOLDINGS,
  MAX_PER_STOCK,
  MIN_CASH_BUFFER,
  TOTAL_CAPITAL,
} from "@/lib/rules";
import type { MarkContext, PaperState } from "@/lib/types";

export function CapitalBar({
  paper,
  sessionLabel,
  markCtx,
}: {
  paper: PaperState;
  sessionLabel: string;
  markCtx?: MarkContext;
}) {
  const used = investedAmount(paper);
  const nav = equity(paper, markCtx);
  const pnl = nav - TOTAL_CAPITAL;
  const maxStock = MAX_PER_STOCK * MAX_HOLDINGS;
  const usedPct = Math.min(100, Math.round((used / maxStock) * 100));

  return (
    <Card size="sm" className="bg-card/90">
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="演示总资金" value={formatYuanPlain(TOTAL_CAPITAL)} />
        <Stat label="可用现金" value={formatYuanPlain(paper.cash)} hint={`缓冲底线 ${formatYuanPlain(MIN_CASH_BUFFER)}`} />
        <Stat
          label="股票占用"
          value={`${paper.positions.length}/${MAX_HOLDINGS} 只 · ${formatYuanPlain(used)}`}
          hint={`单票上限 ${formatYuanPlain(MAX_PER_STOCK)}`}
        />
        <Stat
          label="纸上权益"
          value={formatYuanPlain(nav)}
          valueClass={pnlClass(pnl)}
          hint={
            pnl === 0
              ? "尚未开仓"
              : markCtx?.dataSource === "delayed-public"
                ? `按延迟收盘计价 ${pnl > 0 ? "+" : ""}${formatYuanPlain(pnl).replace("¥", "")}`
                : `相对本金 ${pnl > 0 ? "+" : ""}${formatYuanPlain(pnl).replace("¥", "")}`
          }
        />
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-xs text-muted-foreground">模拟交易日</p>
          <p className="mt-1 font-medium">{formatMonthDay(paper.sessionDate)}</p>
          <p className="text-xs text-muted-foreground">{sessionLabel}</p>
          <Progress value={usedPct} className="mt-2">
            <span className="sr-only">仓位占用</span>
          </Progress>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium tabular-nums ${valueClass ?? ""}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
