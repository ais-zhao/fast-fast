import { formatMonthDay } from "@/lib/market";
import type { OhlcBar } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MiniCandle({ bar, className }: { bar: OhlcBar; className?: string }) {
  const span = Math.max(bar.high - bar.low, 0.01);
  const bodyTop = ((bar.high - Math.max(bar.open, bar.close)) / span) * 100;
  const bodyHeight = Math.max((Math.abs(bar.close - bar.open) / span) * 100, 6);
  const up = bar.close >= bar.open;
  return (
    <div
      className={cn("relative h-8 w-2.5 shrink-0 text-up", !up && "text-down", className)}
      title={`${bar.date} 开${bar.open.toFixed(2)} 高${bar.high.toFixed(2)} 低${bar.low.toFixed(2)} 收${bar.close.toFixed(2)}`}
    >
      <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current" />
      <span
        className="absolute right-0 left-0 rounded-[1px] bg-current"
        style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }}
      />
    </div>
  );
}

export function OhlcStrip({ bar }: { bar: OhlcBar }) {
  const up = bar.close >= bar.open;
  const tone = up ? "text-up" : "text-down";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
      <MiniCandle bar={bar} />
      <span className="text-muted-foreground">{formatMonthDay(bar.date)} 日K</span>
      <span>开 {bar.open.toFixed(2)}</span>
      <span className={tone}>高 {bar.high.toFixed(2)}</span>
      <span className={tone}>低 {bar.low.toFixed(2)}</span>
      <span className={tone}>收 {bar.close.toFixed(2)}</span>
    </div>
  );
}

export function CandleRow({ bars }: { bars: OhlcBar[] }) {
  const shown = bars.slice(-8);
  if (shown.length === 0) return null;
  return (
    <div className="flex items-end gap-1" aria-label="最近几根日K">
      {shown.map((bar) => (
        <MiniCandle key={bar.date} bar={bar} />
      ))}
    </div>
  );
}
