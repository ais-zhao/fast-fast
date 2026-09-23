/** Strip local Clash-style proxies so mainland quote hosts are reached directly. */
const PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;

export function envWithoutProxy(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, NO_PROXY: "*", no_proxy: "*" };
  for (const key of PROXY_KEYS) delete env[key];
  return env;
}

/** Mutate current process env once (safe for warm / desk server workers). */
export function disableProcessProxy() {
  for (const key of PROXY_KEYS) delete process.env[key];
  process.env.NO_PROXY = "*";
  process.env.no_proxy = "*";
}
