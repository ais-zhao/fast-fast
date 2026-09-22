import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthDay } from "@/lib/market";
import { formatYuan, formatYuanPlain, pnlClass } from "@/lib/format";
import type { PaperPosition } from "@/lib/types";

const EXIT_COPY = {
  stop: "止损",
  time: "到期",
  manual: "手动",
} as const;

export function ReviewPanel({ closed }: { closed: PaperPosition[] }) {
  if (closed.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>复盘</CardTitle>
          <CardDescription>
            平仓后会对照计划：有没有超仓、有没有拖过止损、有没有拿超天数。现在还没有结束的交易。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          复盘的目的不是证明自己能赢，而是看有没有破纪律。小白常见的亏法是追涨停、满仓、不止损、不复盘——这些这里都会拦住或记下来。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>复盘</CardTitle>
        <CardDescription>对照当时的计划，而不是事后编理由。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {closed.map((trade) => (
          <article key={trade.id} className="rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {trade.name}{" "}
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {trade.code}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMonthDay(trade.openedOn)} 买 {formatYuan(trade.entryPrice)} →{" "}
                  {trade.exitOn ? formatMonthDay(trade.exitOn) : "—"} 卖{" "}
                  {trade.exitPrice?.toFixed(2)} · {EXIT_COPY[trade.exitReason ?? "manual"]}
                </p>
              </div>
              <p className={`tabular-nums font-medium ${pnlClass(trade.pnl ?? 0)}`}>
                {(trade.pnl ?? 0) >= 0 ? "+" : ""}
                {formatYuanPlain(trade.pnl ?? 0)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline">
                计划 {trade.plannedHoldDays} 天 / 实际 {trade.heldDays ?? 0} 天
              </Badge>
              <Badge variant="outline">仓位 {formatYuanPlain(trade.cost)}</Badge>
              {trade.disciplineBreaks.length === 0 ? (
                <Badge variant="secondary">纪律：遵守计划</Badge>
              ) : (
                <Badge variant="destructive">纪律：有破例</Badge>
              )}
            </div>
            <p className="mt-2 text-sm leading-6">{trade.entryReasons[0]}</p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
              {trade.reviewNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
              {trade.disciplineBreaks.map((note) => (
                <li key={note} className="text-destructive">
                  {note}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
