export function formatYuan(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatYuanPlain(n: number): string {
  return `¥${formatYuan(n)}`;
}

export function formatPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function formatChangePct(pct: number): string {
  return formatPct(pct / 100);
}

export function pnlClass(n: number): string {
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-muted-foreground";
}

export function formatCode(code: string): string {
  return code;
}

export function lotsLabel(lots: number): string {
  return `${lots} 手 / ${lots * 100} 股`;
}
