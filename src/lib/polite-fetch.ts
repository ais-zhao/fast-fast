export type UpstreamSource = "tencent" | "sina";

export type PoliteSourceStatus = {
  source: UpstreamSource;
  active: number;
  consecutiveFails: number;
  circuitUntil: number;
  backoffMs: number;
  completed: number;
};

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type Limiter = {
  source: UpstreamSource;
  concurrency: number;
  minIntervalMs: number;
  jitterRatio: number;
  circuitFailThreshold: number;
  active: number;
  queue: Waiter[];
  nextAt: number;
  consecutiveFails: number;
  circuitUntil: number;
  backoffMs: number;
  completed: number;
  sinceBatch: number;
  batchSize: number;
  batchPauseMinMs: number;
  batchPauseMaxMs: number;
};

const limiters = new Map<UpstreamSource, Limiter>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jittered(ms: number, ratio: number) {
  const delta = ms * ratio;
  return Math.max(0, Math.round(ms - delta + Math.random() * delta * 2));
}

function getLimiter(source: UpstreamSource): Limiter {
  let limiter = limiters.get(source);
  if (limiter) return limiter;
  limiter = {
    source,
    concurrency: 2,
    minIntervalMs: 550,
    jitterRatio: 0.3,
    circuitFailThreshold: 8,
    active: 0,
    queue: [],
    nextAt: 0,
    consecutiveFails: 0,
    circuitUntil: 0,
    backoffMs: 30_000,
    completed: 0,
    sinceBatch: 0,
    batchSize: 50,
    batchPauseMinMs: 8_000,
    batchPauseMaxMs: 15_000,
  };
  limiters.set(source, limiter);
  return limiter;
}

async function acquire(limiter: Limiter) {
  const now = Date.now();
  if (limiter.circuitUntil > now) {
    throw new Error(`${limiter.source} circuit open until ${new Date(limiter.circuitUntil).toISOString()}`);
  }

  if (limiter.active >= limiter.concurrency) {
    await new Promise<void>((resolve, reject) => {
      limiter.queue.push({ resolve, reject });
    });
  }

  limiter.active += 1;
  const wait = Math.max(0, limiter.nextAt - Date.now());
  if (wait > 0) await sleep(wait);
  limiter.nextAt = Date.now() + jittered(limiter.minIntervalMs, limiter.jitterRatio);
}

function release(limiter: Limiter) {
  limiter.active = Math.max(0, limiter.active - 1);
  const next = limiter.queue.shift();
  if (next) next.resolve();
}

export function politeSourceStatus(source?: UpstreamSource): PoliteSourceStatus[] {
  const sources: UpstreamSource[] = source ? [source] : ["tencent", "sina"];
  return sources.map((item) => {
    const limiter = getLimiter(item);
    return {
      source: item,
      active: limiter.active,
      consecutiveFails: limiter.consecutiveFails,
      circuitUntil: limiter.circuitUntil,
      backoffMs: limiter.backoffMs,
      completed: limiter.completed,
    };
  });
}

export function isSourceCircuitOpen(source: UpstreamSource): boolean {
  return getLimiter(source).circuitUntil > Date.now();
}

export function notePoliteSuccess(source: UpstreamSource) {
  const limiter = getLimiter(source);
  limiter.consecutiveFails = 0;
  limiter.backoffMs = 30_000;
  limiter.completed += 1;
  limiter.sinceBatch += 1;
}

export function notePoliteFailure(source: UpstreamSource, hard = false) {
  const limiter = getLimiter(source);
  limiter.consecutiveFails += 1;
  if (hard || limiter.consecutiveFails >= limiter.circuitFailThreshold) {
    limiter.circuitUntil = Date.now() + limiter.backoffMs;
    limiter.backoffMs = Math.min(limiter.backoffMs * 4, 10 * 60_000);
    limiter.consecutiveFails = 0;
    while (limiter.queue.length > 0) {
      limiter.queue.shift()?.reject(new Error(`${source} circuit opened`));
    }
  }
}

/** Run one upstream call under per-source concurrency, jitter, and batch pauses. */
export async function withPoliteSource<T>(
  source: UpstreamSource,
  fn: () => Promise<T>,
): Promise<T> {
  const limiter = getLimiter(source);
  await acquire(limiter);
  try {
    if (limiter.sinceBatch >= limiter.batchSize) {
      const pause = limiter.batchPauseMinMs +
        Math.random() * (limiter.batchPauseMaxMs - limiter.batchPauseMinMs);
      limiter.sinceBatch = 0;
      await sleep(pause);
    }
    return await fn();
  } finally {
    release(limiter);
  }
}

export function configurePoliteSource(
  source: UpstreamSource,
  patch: Partial<Pick<Limiter, "concurrency" | "minIntervalMs" | "batchSize">>,
) {
  Object.assign(getLimiter(source), patch);
}
