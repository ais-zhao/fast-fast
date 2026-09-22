import { HARD_RULE_LINES, MAX_CANDIDATES } from "@/lib/scan-constants";

export function HardRulesNote() {
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        今日硬规则 · 挡住差结构，不保证收益
      </summary>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        最多 {MAX_CANDIDATES}{" "}
        只。这些规则用来少做错结构、强制带止损和空间，不会把胜率变成一个可承诺的数字。
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground/90">
        {HARD_RULE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </details>
  );
}
