"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthDay } from "@/lib/market";
import { formatYuan, formatYuanPlain, lotsLabel, pnlClass } from "@/lib/format";
import {
  currentMark,
  heldTradingDays,
  isTPlusOneLocked,
  stopWouldHit,
} from "@/lib/paper";
import type { ExitReason, PaperPosition, PaperState } from "@/lib/types";

export function PositionsPanel({
  paper,
  onClose,
  onAdvance,
}: {
  paper: PaperState;
  onClose: (id: string, reason: ExitReason) => string | undefined;
  onAdvance: () => void;
}) {
  if (paper.positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>模拟持仓</CardTitle>
          <CardDescription>还没有纸上持仓。从候选里选一只，写完计划再开仓。</CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          同时最多 3 只。买入后会按 T+1 锁住，必须进入下一交易日才能卖。收盘可用下面的按钮推进日期，对照止损和持有天数。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>模拟持仓</CardTitle>
            <CardDescription>
              盯盘价随「下一交易日」变动，仍是模拟数据。跌破止损请按计划走，不要拖。
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onAdvance}>
            收盘，进入下一交易日
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {paper.positions.map((position) => (
          <OpenPositionRow
            key={position.id}
            position={position}
            sessionDate={paper.sessionDate}
            onClose={onClose}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function OpenPositionRow({
  position,
  sessionDate,
  onClose,
}: {
  position: PaperPosition;
  sessionDate: string;
  onClose: (id: string, reason: ExitReason) => string | undefined;
}) {
  const mark = currentMark(position, sessionDate);
  const pnl = (mark - position.entryPrice) * position.shares;
  const held = heldTradingDays(position, sessionDate);
  const locked = isTPlusOneLocked(position, sessionDate);
  const stopHit = stopWouldHit(position, sessionDate) || Boolean(position.stopHitOn);
  const overtime = held > position.plannedHoldDays;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {position.name}{" "}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {position.code}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {lotsLabel(position.lots)} · {formatMonthDay(position.openedOn)} 买入{" "}
            {formatYuan(position.entryPrice)} · 成本 {formatYuanPlain(position.cost)}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular-nums font-medium">{formatYuan(mark)}</p>
          <p className={`text-xs tabular-nums ${pnlClass(pnl)}`}>
            {pnl >= 0 ? "+" : ""}
            {formatYuan(pnl)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline">止损 {position.stopPrice.toFixed(2)}</Badge>
        <Badge variant="outline">
          已持有 {held} / {position.plannedHoldDays} 天
        </Badge>
        {locked ? <Badge variant="secondary">T+1 锁定</Badge> : null}
        {stopHit ? <Badge variant="destructive">应止损离场</Badge> : null}
        {overtime ? <Badge variant="destructive">超过计划天数</Badge> : null}
      </div>
      {locked ? (
        <p className="mt-2 text-xs text-muted-foreground">
          今天刚买进，同一只股票不能当天卖出。先点「进入下一交易日」。
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={locked}
          onClick={() => onClose(position.id, "stop")}
        >
          按止损离场
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => onClose(position.id, "time")}
        >
          到期离场
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={locked}
          onClick={() => onClose(position.id, "manual")}
        >
          手动离场
        </Button>
      </div>
    </div>
  );
}
