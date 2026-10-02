/**
 * HTTP instrumentation: a default request timeout (always on) plus opt-in
 * `--verbose` request tracing.
 *
 * The CLI talks to the platform over two transports: raw `got` (see
 * `api-client.ts`) and the generated `@spec0/sdk-public-platform`, which issues
 * calls through the global `fetch`. Neither had a timeout, so a silently
 * dropped connection could hang the CLI forever, and neither printed anything,
 * so a failing command could not show *which URL* it hit.
 *
 * `installHttpInstrumentation()` wraps the global `fetch` once at startup to
 *   - apply a default timeout (combined with any signal the SDK already passes,
 *     so cancellation still works), and
 *   - trace each request/response when `--verbose` is on.
 * `got` gets the same timeout via its own options and calls `traceRequest` /
 * `traceResponse` from its hooks.
 *
 * All trace output goes to **stderr** so stdout stays a clean single document
 * for `--output json|yaml` consumers.
 */

import chalk from "chalk";

const DEFAULT_TIMEOUT_MS = 30_000;

let enabled = false;
let installed = false;

/**
 * Default per-request timeout in milliseconds. Override with
 * `SPEC0_HTTP_TIMEOUT_MS`; falls back to 30s for any unset/invalid value.
 */
export function httpTimeoutMs(): number {
  const raw = process.env.SPEC0_HTTP_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Enable/disable `--verbose` request tracing. */
export function setHttpTrace(on: boolean): void {
  enabled = on;
}

export function httpTraceEnabled(): boolean {
  return enabled;
}

function line(text: string): void {
  process.stderr.write(chalk.gray(text.endsWith("\n") ? text : `${text}\n`));
}

export function traceRequest(method: string, url: string): void {
  if (enabled) line(`→ ${method} ${url}`);
}

export function traceResponse(status: number, url: string): void {
  if (enabled) line(`← ${status} ${url}`);
}

export function traceError(method: string, url: string, message: string): void {
  if (enabled) line(`✗ ${method} ${url} — ${message}`);
}

/**
 * Combine the SDK's own abort signal (if any) with a timeout signal so a hung
 * request fails fast while explicit cancellation still works.
 */
function withTimeout(init?: RequestInit): RequestInit {
  const timeout = AbortSignal.timeout(httpTimeoutMs());
  const existing = init?.signal ?? undefined;
  const signal =
    existing && typeof AbortSignal.any === "function"
      ? AbortSignal.any([existing, timeout])
      : (existing ?? timeout);
  return { ...init, signal };
}

/**
 * Wrap the global `fetch` once (covers all SDK calls) to apply the default
 * timeout and trace when verbose. Idempotent; safe to call at startup.
 */
export function installHttpInstrumentation(): void {
  if (installed) return;
  const original = globalThis.fetch;
  if (typeof original !== "function") return;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method =
      init?.method ??
      (typeof input === "object" && input !== null && "method" in input
        ? (input as Request).method
        : "GET");
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    traceRequest(method, url);
    try {
      const res = await original(input, withTimeout(init));
      traceResponse(res.status, url);
      return res;
    } catch (err) {
      traceError(method, url, (err as Error).message);
      throw err;
    }
  }) as typeof fetch;
  installed = true;
}
