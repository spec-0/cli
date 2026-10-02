/**
 * spec0 mock list — one row per mock server in the org.
 *
 * Backed by `PublicMocksService.listPublicMocks` from
 * `@spec0/sdk-public-platform`.
 */

import { Command } from "commander";
import { PublicMocksService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import { emit, fail, resolveOutputContext, type OutputOptions } from "../../lib/output/index.js";
import { renderTable } from "../../lib/output/table.js";

export function registerMockListCommand(mock: Command) {
  mock
    .command("list")
    .description("List all mock servers in the org.")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (opts: OutputOptions & { org?: string }) => {
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      let authCtx;
      try {
        authCtx = requireOrgContext(opts.org);
      } catch (e) {
        fail(outCtx, ExitCode.AUTH_MISSING, (e as Error).message, {
          hint: "Set SPEC0_TOKEN + SPEC0_ORG_ID, or run 'spec0 auth login'.",
        });
      }

      configureSdkAuth(authCtx);
      try {
        const rows = await PublicMocksService.listPublicMocks();
        const enriched = rows.map((m) => ({
          api: m.apiName ?? m.apiId ?? "—",
          name: m.name ?? "—",
          mockUrl: `${authCtx.apiUrl}${m.mockBaseUrl ?? ""}`,
        }));
        emit(outCtx, enriched, (data) =>
          renderTable(data as unknown as Record<string, unknown>[], [
            { key: "api", header: "API" },
            { key: "name", header: "Name" },
            { key: "mockUrl", header: "Mock URL" },
          ]),
        );
      } catch (err) {
        failApi(outCtx, err, {
          action: "mock list",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}
