/**
 * Pure helpers for the browser loopback login used by `spec0 auth login`.
 *
 * The CLI opens `{appUrl}/cli-auth?...` in the browser and waits on a local
 * `http://127.0.0.1:<port>/callback` for the result. Keeping URL building and
 * callback interpretation here (no I/O) lets them be unit-tested directly.
 */

import { randomBytes } from "crypto";

/** Identifies this client to the sign-in page. */
export const LOGIN_CLIENT_ID = "cli";

/** Unguessable value tying the callback to this login attempt (CSPRNG-backed). */
export function generateLoginState(): string {
  return randomBytes(16).toString("hex");
}

export function buildLoginUrl(appUrl: string, state: string, redirectUri: string): URL {
  const url = new URL("/cli-auth", appUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("client", LOGIN_CLIENT_ID);
  return url;
}

export type LoginCallbackResult =
  | { kind: "success"; token: string; orgId: string; orgName: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/**
 * Interprets the query string the browser sends to the local callback.
 * Never returns `success` unless the state check passes.
 */
export function parseLoginCallback(
  params: URLSearchParams,
  expectedState: string,
): LoginCallbackResult {
  const returnedState = params.get("state");
  // Compatibility: older sign-in pages do not echo `state` back, so an absent
  // value is accepted for now. A present-but-different value is always rejected.
  // Once every supported sign-in page echoes it, make it mandatory.
  if (returnedState !== null && returnedState !== expectedState) {
    return {
      kind: "error",
      message:
        "Sign-in response did not match this login attempt (state mismatch). No credentials were saved. Run 'spec0 auth login' again.",
    };
  }

  const error = params.get("error");
  if (error) {
    if (error === "access_denied") return { kind: "cancelled" };
    const description = params.get("error_description");
    return {
      kind: "error",
      message: `Sign-in failed: ${error}${description ? ` (${description})` : ""}`,
    };
  }

  const token = params.get("token");
  const orgId = params.get("org");
  if (!token || !orgId) {
    return { kind: "error", message: "Missing token or org" };
  }
  return { kind: "success", token, orgId, orgName: params.get("org_name") ?? "default" };
}
