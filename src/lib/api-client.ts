/**
 * Platform API HTTP client
 */

import got, { type Options } from "got";
import { ApiError, OpenAPI } from "@spec0/sdk-public-platform";
import type { OrgConfig } from "./config.js";
import type { ResolvedOrgContext } from "./auth-context.js";
import { httpTimeoutMs, httpTraceEnabled, traceRequest, traceResponse } from "./http-trace.js";

export interface ApiClientOptions {
  apiUrl?: string;
  apiKey?: string;
  orgId?: string;
}

/**
 * Shared `got` instance with `--verbose` tracing hooks. All raw HTTP goes
 * through this so a single `setHttpTrace(true)` makes every request visible on
 * stderr (the SDK is traced separately via the global `fetch` wrapper).
 */
const http = got.extend({
  // Fail fast on a hung connection rather than blocking the CLI forever.
  // got's TimeoutError carries code ETIMEDOUT, which classifies to NETWORK_ERROR.
  timeout: { request: httpTimeoutMs() },
  hooks: {
    beforeRequest: [
      (options) => {
        if (options.url) traceRequest(options.method, options.url.toString());
      },
    ],
    afterResponse: [
      (response) => {
        traceResponse(response.statusCode, response.requestUrl.toString());
        return response;
      },
    ],
    beforeError: [
      (error) => {
        if (httpTraceEnabled()) {
          const url = (error.response?.requestUrl ?? error.options?.url)?.toString() ?? "";
          traceResponse(error.response?.statusCode ?? 0, url);
        }
        return error;
      },
    ],
  },
});

function orgHeaders(orgId: string, extra?: Record<string, string>): Record<string, string> {
  return { "X-Org-Id": orgId, ...extra };
}

export function createApiClient(org: OrgConfig) {
  const baseUrl = org.apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${org.apiKey}`,
  };

  return {
    async get<T = unknown>(path: string, options?: Options): Promise<T> {
      const res = await http.get(`${baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
        responseType: "json",
      });
      return res.body as T;
    },

    async post<T = unknown>(path: string, body?: unknown, options?: Options): Promise<T> {
      const res = await http.post(`${baseUrl}${path}`, {
        ...options,
        json: body,
        headers: { ...headers, ...options?.headers },
        responseType: "json",
      });
      return res.body as T;
    },

    async put<T = unknown>(path: string, body?: unknown, options?: Options): Promise<T> {
      const res = await http.put(`${baseUrl}${path}`, {
        ...options,
        json: body,
        headers: { ...headers, ...options?.headers },
        responseType: "json",
      });
      return res.body as T;
    },

    async delete<T = unknown>(path: string, options?: Options): Promise<T> {
      const res = await http.delete(`${baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
        responseType: "json",
      });
      return res.body as T;
    },
  };
}

/** Org API key client (discovery, registry, CLI workspace). */
export function createOrgApiClient(ctx: ResolvedOrgContext) {
  // The platform API is served at the host root — the same base `configureSdkAuth()`
  // gives the SDK. Call sites supply their own service path (e.g. `api show`), so we
  // only normalize a trailing slash here and never append a context path.
  const baseUrl = ctx.apiUrl.replace(/\/$/, "");
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${ctx.apiKey}`,
    "X-Org-Id": ctx.orgId,
  };

  return {
    baseUrl,
    async getJson<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
      const res = await http.get(`${baseUrl}${path}`, {
        headers: { ...baseHeaders, Accept: "application/json", ...headers },
        responseType: "json",
      });
      return res.body as T;
    },
    async getText(path: string, headers?: Record<string, string>): Promise<string> {
      const res = await http.get(`${baseUrl}${path}`, {
        headers: {
          ...baseHeaders,
          Accept: "application/yaml, application/json, text/plain, */*",
          ...headers,
        },
      });
      return res.body;
    },
    async postJson<T = unknown>(
      path: string,
      body: unknown,
      headers?: Record<string, string>,
    ): Promise<T> {
      const res = await http.post(`${baseUrl}${path}`, {
        json: body,
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        responseType: "json",
      });
      return res.body as T;
    },
    async putJson<T = unknown>(
      path: string,
      body: unknown,
      headers?: Record<string, string>,
    ): Promise<T> {
      const res = await http.put(`${baseUrl}${path}`, {
        json: body,
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        responseType: "json",
      });
      return res.body as T;
    },
    async postMultipart<T = unknown>(
      path: string,
      fields: Record<string, { content: Buffer | string; filename: string }>,
      headers?: Record<string, string>,
    ): Promise<T> {
      const form = new FormData();
      for (const [name, { content, filename }] of Object.entries(fields)) {
        const blob = new Blob([content], { type: "application/octet-stream" });
        form.append(name, blob, filename);
      }
      const res = await http.post(`${baseUrl}${path}`, {
        body: form,
        headers: { ...baseHeaders, Accept: "application/json", ...headers },
        responseType: "json",
      });
      return res.body as T;
    },
    async deleteJson<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
      const res = await http.delete(`${baseUrl}${path}`, {
        headers: { ...baseHeaders, Accept: "application/json", ...headers },
        responseType: "json",
      });
      return res.body as T;
    },
  };
}

export { orgHeaders };

/**
 * Configure the `@spec0/sdk-public-platform` global `OpenAPI` singleton from a
 * resolved org context. The SDK's request builder formats URLs as
 * `OpenAPI.BASE + <service-path>`, where service paths look like
 * `/api/v1/public/apis`. The CLI's stored `apiUrl` is the platform host root
 * and the SDK already carries context-path-less service paths, so `OpenAPI.BASE`
 * is the bare host with no suffix appended.
 *
 * `OpenAPI.TOKEN` is set to the org API key — the SDK adds the
 * `Authorization: Bearer <token>` header automatically. `X-Org-Id` rides on
 * `OpenAPI.HEADERS` so it's sent on every SDK call.
 *
 * Call this once per command invocation after `requireOrgContext()`. It is
 * idempotent and safe to invoke multiple times in the same process.
 */
export function configureSdkAuth(ctx: ResolvedOrgContext): void {
  OpenAPI.BASE = ctx.apiUrl;
  OpenAPI.TOKEN = ctx.apiKey;
  OpenAPI.HEADERS = { "X-Org-Id": ctx.orgId };
}

/**
 * Extract the HTTP status code from either a `got`-style error
 * (`err.response.statusCode`) or a SDK `ApiError` (`err.status`).
 * Returns `undefined` if neither is present.
 */
export function errorStatusCode(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  return (err as { response?: { statusCode?: number } })?.response?.statusCode;
}

/**
 * Extract the request method + final URL from an error, for diagnostics.
 * Handles both SDK `ApiError` (`err.url` / `err.request.method`) and `got`
 * errors (`err.response.requestUrl` / `err.options.method`). Returns
 * `undefined` fields when nothing is available.
 */
export function errorRequestInfo(err: unknown): { method?: string; url?: string } {
  if (err instanceof ApiError) {
    return { method: err.request?.method, url: err.url };
  }
  const e = err as {
    options?: { method?: string };
    response?: { requestUrl?: unknown };
    request?: { requestUrl?: unknown };
  };
  const rawUrl = e?.response?.requestUrl ?? e?.request?.requestUrl;
  return { method: e?.options?.method, url: rawUrl ? String(rawUrl) : undefined };
}

export function is401(err: unknown): boolean {
  return errorStatusCode(err) === 401;
}

export function is402(err: unknown): boolean {
  return errorStatusCode(err) === 402;
}

/**
 * Extract a human-readable error message from a backend error response.
 * Handles both `got`-style errors (`err.response.body`) and SDK `ApiError`
 * instances (`err.body`).
 */
export function extractErrorMessage(err: unknown): string | null {
  let body: unknown;
  if (err instanceof ApiError) {
    body = err.body;
  } else {
    body = (err as { response?: { body?: unknown } })?.response?.body;
  }
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    const msg = b["message"] ?? b["detail"] ?? b["error"];
    if (msg) return String(msg);
  }
  return null;
}
