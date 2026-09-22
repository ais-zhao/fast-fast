"use client";

import { useEffect, useMemo, useState } from "react";
import { CapitalBar } from "@/components/capital-bar";
import {
  CandidateList,
  CandidateListSkeleton,
  CapitalBarSkeleton,
} from "@/components/candidate-list";
import { DisclaimerBanner } from "@/components/disclaimer-banner";
import { PositionsPanel } from "@/components/positions-panel";
import { ReviewPanel } from "@/components/review-panel";
import { TradePlanCard } from "@/components/trade-plan-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaperAccount } from "@/hooks/use-paper-account";
import { getDeskPayload } from "@/lib/mock-data";
import { formatMonthDay, nextTradingDay } from "@/lib/market";
import { latestQuoteDate } from "@/lib/quotes";
import { advanceSession, tryClosePosition, tryOpenPosition } from "@/lib/paper";
import type { Candidate, DeskPayload, ExitReason, MarketScene, MarkContext, QuoteBook } from "@/lib/types";
import { CircleAlert, RefreshCw } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export function DeskApp({ initialPayload }: { initialPayload: DeskPayload }) {
  const [scene, setScene] = useState<MarketScene>("ok");
  const [offline, setOffline] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DeskPayload>(initialPayload);
  const [quotes, setQuotes] = useState<QuoteBook>(initialPayload.quotes ?? {});
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { state: paper, setState: setPaper, reset } = usePaperAccount(payload.planFor);

  useEffect(() => {
    void load("ok", false);
    // First paint uses SSR mock; delayed scan runs once after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only fetch
  }, []);

  async function load(nextScene: MarketScene, nextOffline: boolean) {
    setLoadState("loading");
    setError(null);
    try {
      if (nextOffline) {
        const offlinePayload = getDeskPayload("ok");
        setPayload(offlinePayload);
        setQuotes(offlinePayload.quotes);
        setLoadState("ready");
        return;
      }
      const held = paper.positions.map((item) => item.code).join(",");
      const response = await fetch(`/api/desk?scene=${nextScene}&held=${held}`, { cache: "no-store" });
      if (!response.ok) {
        if (nextScene === "error") {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "行情源暂时不可用。");
          setPayload((current) => ({ ...current, candidates: [] }));
          setLoadState("error");
          return;
        }
        const fallback = getDeskPayload("ok");
        fallback.notice = "公开延迟行情暂不可用，已改用离线演示数据。不是实时行情，也不是投资建议。";
        setPayload(fallback);
        setQuotes(fallback.quotes);
        setLoadState("ready");
        return;
      }
      const next = (await response.json()) as DeskPayload;
      setPayload(next);
      setQuotes(next.quotes ?? {});
      setLoadState("ready");
    } catch {
      const fallback = getDeskPayload("ok");
      fallback.notice = "连不上公开行情接口，已改用离线演示。纸上推演可以继续。";
      setPayload(fallback);
      setQuotes(fallback.quotes);
      setLoadState("ready");
    }
  }

  const candidates = payload.candidates;
  const selected: Candidate | null =
    candidates.find((item) => item.code === selectedCode) ?? null;

  const heldCodes = useMemo(
    () => paper.positions.map((item) => item.code),
    [paper],
  );

  const markCtx = useMemo<MarkContext>(
    () => ({ dataSource: payload.dataSource, quotes }),
    [payload.dataSource, quotes],
  );

  function selectCandidate(code: string) {
    setSelectedCode(code);
    const plan = document.getElementById("trade-plan");
    plan?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBuy(input: { lots: number; stopPrice: number; holdDays: number }) {
    if (!selected) return "还没有选中候选。";
    const result = tryOpenPosition(paper, selected, input.lots, input.stopPrice, input.holdDays);
    if (result.error) return result.error;
    setPaper(result.state);
    if (!quotes[selected.code] && selected.bar) {
      setQuotes((current) => ({ ...current, [selected.code]: [selected.bar] }));
    }
    setFlash(`${selected.name} 已按计划记入纸上持仓，按这根日K收盘计价，不是真实委托。`);
    return undefined;
  }

  function handleClose(id: string, reason: ExitReason) {
    const result = tryClosePosition(paper, id, reason, markCtx);
    if (result.error) {
      setFlash(result.error);
      return result.error;
    }
    setPaper(result.state);
    setFlash("已平仓，去复盘页对照计划。");
    return undefined;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] text-muted-foreground">A 股 · 纸上模拟</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">波段作战台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              T+1 至 3～5 日波段 · 不打板 · 不接券商实盘
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              演示场景
              <select
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                value={offline ? "offline" : scene}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "offline") {
                    setOffline(true);
                    setScene("ok");
                    void load("ok", true);
                    return;
                  }
                  setOffline(false);
                  setScene(value as MarketScene);
                  void load(value as MarketScene, false);
                }}
              >
                <option value="ok">正常候选</option>
                <option value="empty">没有候选</option>
                <option value="error">行情失败</option>
                <option value="offline">离线演示</option>
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => void load(scene, offline)}>
              <RefreshCw />
              刷新
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              重置账户
            </Button>
          </div>
        </div>
        <DisclaimerBanner />
        <p className="text-sm text-muted-foreground">
          {payload.sessionLabel}。
          {payload.dataSource === "delayed-public" ? "数据源：公开延迟行情，持仓按日K收盘计价。" : "数据源：离线演示。"}
          {payload.notice}
          {offline ? " 已锁定离线演示。" : ""}
        </p>
        {loadState === "loading" ? (
          <p className="text-xs text-muted-foreground" role="status">
            正在拉取公开延迟行情…
          </p>
        ) : null}
        {flash ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm" role="status">
            {flash}
          </p>
        ) : null}
      </header>

      {paper ? (
        <CapitalBar paper={paper} sessionLabel={payload.sessionLabel} markCtx={markCtx} />
      ) : (
        <CapitalBarSkeleton />
      )}

      {loadState === "error" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>行情没有加载出来</AlertTitle>
          <AlertDescription>
            {error}
            <span className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void load(scene, offline)}>
                重试
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setOffline(true);
                  setScene("ok");
                  void load("ok", true);
                }}
              >
                改用离线演示
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium">今日候选</h2>
              <p className="text-sm text-muted-foreground">
                最多 8 只，用人话写出入选原因。点进去才生成交易计划卡。
              </p>
            </div>
            {loadState !== "error" ? (
              <p className="text-xs text-muted-foreground">{candidates.length} / 8</p>
            ) : null}
          </div>
          {loadState === "loading" && candidates.length === 0 ? <CandidateListSkeleton /> : null}
          {loadState !== "error" && loadState !== "loading" && candidates.length === 0 ? (
            <EmptyCandidates planFor={payload.planFor} />
          ) : null}
          {candidates.length > 0 ? (
            <CandidateList
              candidates={candidates}
              selectedCode={selectedCode}
              heldCodes={heldCodes}
              onSelect={selectCandidate}
            />
          ) : null}
          {loadState === "error" ? (
            <p className="rounded-xl border border-dashed p-6 text-sm leading-6 text-muted-foreground">
              候选列表现在不能用。重试，或改用离线演示，保证还能把「看候选 → 写计划 →
              模拟成交 → 复盘」走完。
            </p>
          ) : null}
        </section>

        <section id="trade-plan" className="flex min-w-0 flex-col gap-4 scroll-mt-4">
          <TradePlanCard
            key={selected?.code ?? "empty"}
            candidate={selected}
            paper={paper}
            bars={selected ? quotes[selected.code] : undefined}
            onBuy={handleBuy}
          />
          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">模拟持仓</TabsTrigger>
              <TabsTrigger value="review">复盘</TabsTrigger>
            </TabsList>
            <TabsContent value="positions" className="pt-3">
              <PositionsPanel
                paper={paper}
                markCtx={markCtx}
                onClose={handleClose}
                onAdvance={() => {
                  const next = nextTradingDay(paper.sessionDate);
                  setPaper((current) => advanceSession(current, markCtx));
                  const quoteAsOf = latestQuoteDate(markCtx);
                  setFlash(
                    payload.dataSource === "delayed-public"
                      ? `已进入 ${formatMonthDay(next)}，T+1 已解锁。${
                          quoteAsOf && next > quoteAsOf
                            ? `公开日K只到 ${formatMonthDay(quoteAsOf)}，浮盈仍按这根收盘计，不会再编涨跌。`
                            : "浮盈按对应那根日K收盘计。"
                        }`
                      : `已进入 ${formatMonthDay(next)}。盯盘价按离线演示路径更新；若碰到止损，请按计划离场。`,
                  );
                }}
              />
            </TabsContent>
            <TabsContent value="review" className="pt-3">
              <ReviewPanel closed={paper.closed} />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <footer className="mt-auto border-t pt-4 text-xs leading-5 text-muted-foreground">
        演示资金 10 万元，单票上限 2 万元，同时最多 3
        只。本工具只训练纪律，不提供荐股，也不承诺任何收益。
      </footer>
    </div>
  );
}

function EmptyCandidates({ planFor }: { planFor?: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6">
      <h3 className="font-medium">这一批没有可做的票</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {planFor ? `${formatMonthDay(planFor)} 的` : ""}
        扫描没有找出符合规则的标的：近几日放量、站上短期均线、而且不是涨停追高。空仓也是一种计划，不必硬找。
      </p>
    </div>
  );
}
