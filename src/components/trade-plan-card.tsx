"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CandleRow, OhlcStrip } from "@/components/ohlc-strip";
import { formatYuanPlain, lotsLabel } from "@/lib/format";
import {
  DEFAULT_HOLD_DAYS,
  MAX_HOLD_DAYS,
  MAX_PER_STOCK,
  MAX_RISK_PER_TRADE,
  MIN_HOLD_DAYS,
  TOTAL_CAPITAL,
  buyBlockCopy,
  canOpenPosition,
  clampHoldDays,
  maxLotsForPrice,
  positionCost,
  rewardRisk,
  suggestedLots,
  suggestedStop,
} from "@/lib/rules";
import type { Candidate, OhlcBar, PaperState } from "@/lib/types";

function initialLots(candidate: Candidate, cash: number) {
  const stop = suggestedStop(
    candidate.last,
    candidate.ma10,
    candidate.suggestedStopPct,
    candidate.suggestedStopPrice,
  );
  const nextLots = Math.max(
    1,
    suggestedLots(candidate.last, cash, stop) || maxLotsForPrice(candidate.last),
  );
  return Math.max(1, Math.min(nextLots, maxLotsForPrice(candidate.last) || 1));
}

export function TradePlanCard({
  candidate,
  paper,
  bars,
  onBuy,
}: {
  candidate: Candidate | null;
  paper: PaperState;
  bars?: OhlcBar[];
  onBuy: (input: { lots: number; stopPrice: number; holdDays: number }) => string | undefined;
}) {
  if (!candidate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>交易计划卡</CardTitle>
          <CardDescription>
            先点左侧候选。没有计划就不能开仓：必须先写清买多少、亏多少走、最多拿几天。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          默认单票不超过总资金 20%（2 万元），同时最多 3 只，并留下现金缓冲。硬规则先挡住追高、爆量和没有空间的票，再谈仓位。风格是 T+1 到 3～5 日波段，不打板，也不能当天买卖同一只股票。
        </CardContent>
      </Card>
    );
  }

  return <FilledPlan candidate={candidate} paper={paper} bars={bars} onBuy={onBuy} />;
}

function FilledPlan({
  candidate,
  paper,
  bars,
  onBuy,
}: {
  candidate: Candidate;
  paper: PaperState;
  bars?: OhlcBar[];
  onBuy: (input: { lots: number; stopPrice: number; holdDays: number }) => string | undefined;
}) {
  const [lots, setLots] = useState(() => initialLots(candidate, paper.cash));
  const [stopPrice, setStopPrice] = useState(() =>
    suggestedStop(
      candidate.last,
      candidate.ma10,
      candidate.suggestedStopPct,
      candidate.suggestedStopPrice,
    ).toFixed(2),
  );
  const [holdDays, setHoldDays] = useState(() =>
    clampHoldDays(candidate.suggestedHoldDays || DEFAULT_HOLD_DAYS),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const plan = useMemo(() => {
    const cost = positionCost(lots, candidate.last);
    const stop = Number(stopPrice);
    const risk = Number.isFinite(stop) ? (candidate.last - stop) * lots * 100 : 0;
    const rr = Number.isFinite(stop) ? rewardRisk(candidate.last, stop, candidate.targetPrice) : 0;
    const check = canOpenPosition({
      code: candidate.code,
      lots,
      price: candidate.last,
      cash: paper.cash,
      openCodes: paper.positions.map((item) => item.code),
    });
    return { cost, stop, risk, rr, check };
  }, [candidate, lots, paper.cash, paper.positions, stopPrice]);

  const maxLots = Math.max(1, maxLotsForPrice(candidate.last));
  const disabled = !plan.check.ok;
  const blockText = plan.check.ok ? null : buyBlockCopy(plan.check.reason);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          {candidate.name}{" "}
          <span className="font-mono text-sm font-normal text-muted-foreground">
            {candidate.code}
          </span>
        </CardTitle>
        <CardDescription>
          {candidate.setupKind} · 这根日K收盘 {candidate.last.toFixed(2)} 元 · 目标{" "}
          {candidate.targetPrice.toFixed(2)} · 5 日均线 {candidate.ma5.toFixed(2)} · 10 日均线{" "}
          {candidate.ma10.toFixed(2)}。按这根收盘价纸上成交，不是实时委托。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <OhlcStrip bar={candidate.bar} />
          {bars && bars.length > 1 ? <CandleRow bars={bars} /> : null}
        </div>
        <section>
          <h3 className="text-sm font-medium">为什么入选</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6">
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-medium">什么情况下作废</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            {candidate.invalidateWhen.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lots">买多少（手数）</Label>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setLots((value) => Math.max(1, value - 1))}
              >
                −
              </Button>
              <Input
                id="lots"
                type="number"
                min={1}
                max={maxLots}
                value={lots}
                onChange={(event) => setLots(Math.max(1, Number(event.target.value) || 1))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setLots((value) => Math.min(maxLots, value + 1))}
              >
                +
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {lotsLabel(lots)} · 约 {formatYuanPlain(plan.cost)} · 占本金{" "}
              {((plan.cost / TOTAL_CAPITAL) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop">亏多少走（止损价）</Label>
            <Input
              id="stop"
              type="number"
              step="0.01"
              value={stopPrice}
              onChange={(event) => setStopPrice(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              相对收盘约 {(((candidate.last - plan.stop) / candidate.last) * 100).toFixed(1)}%
              ，这笔最多大约亏 {formatYuanPlain(Math.max(0, plan.risk))}
              {plan.risk > MAX_RISK_PER_TRADE
                ? `，已超过单笔风险 ${formatYuanPlain(MAX_RISK_PER_TRADE)} 的建议上限`
                : ""}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>最多拿几天</Label>
            <div className="flex gap-1.5">
              {Array.from({ length: MAX_HOLD_DAYS - MIN_HOLD_DAYS + 1 }, (_, index) => {
                const day = MIN_HOLD_DAYS + index;
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={holdDays === day ? "default" : "outline"}
                    onClick={() => setHoldDays(day)}
                  >
                    {day} 天
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">只做 T+1 到 3～5 日。当天买了不能当天卖。</p>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          目标价 {candidate.targetPrice.toFixed(2)}，当前盈亏比 {plan.rr.toFixed(2)}
          {plan.rr < 1.3 ? "（把止损放宽后空间不够，这张卡不再是硬规则里的结构）" : "（至少 1.3 才算过硬规则）"}
          。单票上限 {formatYuanPlain(MAX_PER_STOCK)}。买入后现金约{" "}
          {formatYuanPlain(paper.cash - plan.cost)}。
        </p>
        {blockText ? <p className="text-sm text-destructive">{blockText}</p> : null}
        {message ? (
          <p className={`text-sm ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          disabled={disabled || !Number.isFinite(plan.stop) || plan.stop >= candidate.last}
          onClick={() => {
            if (!Number.isFinite(plan.stop) || plan.stop >= candidate.last) {
              setMessage({ ok: false, text: "止损价必须低于买入价，否则这张计划卡不算完整。" });
              return;
            }
            const error = onBuy({ lots, stopPrice: plan.stop, holdDays });
            setMessage(
              error
                ? { ok: false, text: error }
                : { ok: true, text: "已记入纸上持仓。这不是真实委托。" },
            );
          }}
        >
          按计划纸上买入
        </Button>
      </CardFooter>
    </Card>
  );
}
