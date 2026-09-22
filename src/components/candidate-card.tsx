import { OhlcStrip } from "@/components/ohlc-strip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatChangePct, formatYuan, pnlClass } from "@/lib/format";
import type { Candidate } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CandidateCard({
  candidate,
  selected,
  alreadyHeld,
  onSelect,
}: {
  candidate: Candidate;
  selected: boolean;
  alreadyHeld: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-sm",
        selected && "ring-2 ring-primary",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {candidate.name}
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {candidate.code}
              </span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {candidate.board} · 量比 {candidate.volumeRatio.toFixed(2)} · 连涨{" "}
              {candidate.consecutiveUpDays} 天
            </p>
          </div>
          <div className="text-right">
            <p className="tabular-nums font-medium">{formatYuan(candidate.last)}</p>
            <p className={`text-xs tabular-nums ${pnlClass(candidate.changePct)}`}>
              {formatChangePct(candidate.changePct)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <OhlcStrip bar={candidate.bar} />
        {candidate.sourceUrl ? (
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            腾讯日K原文 · {candidate.bar.date}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">离线演示 K 线，不是腾讯原文。</p>
        )}
        <p className="text-sm leading-6 text-foreground/90">{candidate.reasons[0]}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">未涨停</Badge>
          <Badge variant="outline">站上均线</Badge>
          {alreadyHeld ? <Badge>已持有</Badge> : null}
        </div>
      </CardContent>
    </Card>
  );
}
