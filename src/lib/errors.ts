/**
 * One place to turn a failed platform call into a diagnosable error.
 *
 * Before this, command catch-blocks printed a bare `(err as Error).message` —
 * e.g. `api list failed: Not Found` — with no HTTP status, no URL, and no hint
 * about which org/base was targeted. A developer literally could not tell what
 * went wrong. `failApi` classifies the error into a stable exit code and surfaces:
 *
 *   - the server's own message (from the response body when present),
 *   - the HTTP status (or a network label when the request never completed),
 *   - the method + URL that failed,
 *   - the active org + API base, and
 *   - a code-specific hint.
 *
 * In `--output json|yaml` mode the request/org context rides in `details` so the
 * document stays a single clean object; in text mode it is appended to the
 * message so a human sees it inline.
 */

import { errorStatusCode, errorRequestInfo, extractErrorMessage } from "./api-client.js";
import { ExitCode, exitCodeForHttpStatus, type ExitCodeValue } from "./exit-codes.js";
import { fail, type OutputContext } from "./output/index.js";

export interface ApiErrorContext {
  /** Short action label, e.g. "api list", "mock create". */
  action: string;
  /** Active org name or id, for diagnostics. */
  org?: string;
  /** API base the call targeted, for diagnostics. */
  apiUrl?: string;
}

const HINTS: Partial<Record<ExitCodeValue, string>> = {
  [ExitCode.AUTH_MISSING]: "Run 'spec0 auth login', or refresh SPEC0_TOKEN.",
  [ExitCode.PERMISSION_DENIED]: "Your account lacks permission for this resource.",
  [ExitCode.NOT_FOUND]: "Check the name/id, or confirm SPEC0_API_URL points at the right backend.",
  [ExitCode.CONFLICT]: "A resource with that name/version already exists.",
  [ExitCode.VALIDATION]: "The request was rejected as invalid — see the message above.",
  [ExitCode.RATE_LIMITED]: "Rate limit hit — wait a moment and retry.",
  [ExitCode.SERVER_ERROR]: "Server error — retry shortly; if it persists, contact support.",
  [ExitCode.NETWORK_ERROR]:
    "Could not reach the platform. Check connectivity, then SPEC0_API_URL (run 'spec0 doctor').",
};

/**
 * Best-effort label for a request that never produced an HTTP response.
 * `got` puts the code on the error itself; the SDK uses `fetch`, which wraps the
 * real cause (so the visible message is an unhelpful "fetch failed" and the code
 * lives on `err.cause`). Check both.
 */
function networkLabel(err: unknown): string | undefined {
  // A `fetch` timeout/cancellation is a DOMException with no `code` — it
  // identifies itself by `name` ("TimeoutError" / "AbortError") instead.
  const name =
    (err as { name?: string })?.name ?? (err as { cause?: { name?: string } })?.cause?.name;
  if (name === "TimeoutError") return "timed out";
  if (name === "AbortError") return "request aborted";

  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (!code) return undefined;
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host not found";
  if (code === "ETIMEDOUT" || code === "ETIME") return "timed out";
  return code;
}

export interface ApiErrorReport {
  code: ExitCodeValue;
  /** Message for `fail()` — multi-line (with request/org) only in text mode. */
  message: string;
  hint?: string;
  details: Record<string, unknown>;
}

/**
 * Pure classification of a failed platform call into an exit code, message,
 * hint and structured details. Separated from `failApi` so it can be unit
 * tested without `process.exit`.
 */
export function buildApiError(
  err: unknown,
  info: ApiErrorContext,
  format: OutputContext["format"] = "text",
): ApiErrorReport {
  const status = errorStatusCode(err);
  const code = exitCodeForHttpStatus(status);
  const netLabel = status === undefined ? networkLabel(err) : undefined;
  const serverMsg = extractErrorMessage(err);
  const base = serverMsg ?? netLabel ?? (err as Error)?.message ?? String(err);
  const { method, url } = errorRequestInfo(err);

  const statusPart = status !== undefined ? `HTTP ${status}` : undefined;
  let message = `${info.action} failed: ${base}` + (statusPart ? ` (${statusPart})` : "");

  const requestLine = url ? `${method ?? "GET"} ${url}` : undefined;
  if (format === "text") {
    const extra = [
      requestLine ? `  ${requestLine}` : undefined,
      info.org ? `  org: ${info.org}` : undefined,
    ].filter(Boolean);
    if (extra.length) message += "\n" + extra.join("\n");
  }

  return {
    code,
    message,
    hint: HINTS[code],
    details: {
      ...(status !== undefined ? { status } : {}),
      ...(requestLine ? { request: requestLine } : {}),
      ...(info.org ? { org: info.org } : {}),
      ...(info.apiUrl ? { apiUrl: info.apiUrl } : {}),
    },
  };
}

/**
 * Report a failed platform call and exit. Never returns.
 */
export function failApi(ctx: OutputContext, err: unknown, info: ApiErrorContext): never {
  const report = buildApiError(err, info, ctx.format);
  fail(ctx, report.code, report.message, { hint: report.hint, details: report.details });
}
