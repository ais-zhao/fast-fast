import { warmKlineLibrary, shutdownKlineWarm } from "../src/lib/kline-warm";

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const limitRaw = readArg("--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const includeFail = process.argv.includes("--include-fail");
  console.log(
    JSON.stringify(
      {
        starting: true,
        limit: limit ?? null,
        includeFail,
        hint: "Polite multi-source warm. Safe to Ctrl+C and resume later.",
      },
      null,
      2,
    ),
  );

  const result = await warmKlineLibrary({
    limit: Number.isFinite(limit) ? limit : undefined,
    includeFail,
    onProgress: (info) => {
      if (info.done % 10 === 0 || !info.ok || info.done === info.total) {
        console.log(
          `[${info.done}/${info.total}] ${info.code} ${info.ok ? `ok via ${info.via}` : `fail ${info.error ?? ""}`}`,
        );
      }
    },
  });

  console.log(JSON.stringify(result, null, 2));
  shutdownKlineWarm();
}

main().catch((error) => {
  console.error(error);
  shutdownKlineWarm();
  process.exitCode = 1;
});
