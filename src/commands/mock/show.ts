/**
 * spec0 mock show <api> — structured view of a single mock server.
 *
 * Backend lacks a GET /mocks/{id} endpoint, so we fetch the full list via the
 * SDK and filter client-side by API name or id. Cheap enough for any realistic
 * org. Migrated to `PublicMocksService.listPublicMocks` — same wire path as
 * `mock list`/`mock url`.
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicMocksService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import { emit, fail, resolveOutputContext, type OutputOptions } from "../../lib/output/index.js";

interface MockShowResult {
  apiId?: string;
  apiName?: string;
  mockServerId?: string;
  name?: string;
  mockUrl: string;
}

export function registerMockShowCommand(mock: Command) {
  mock
    .command("show <api>")
    .description("Show details for the mock server tied to <api> (name or UUID).")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (api: string, opts: OutputOptions & { org?: string }) => {
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
        const needle = api.toLowerCase();
        const hit = rows.find(
          (r) =>
            (r.apiName ?? "").toLowerCase() === needle || (r.apiId ?? "").toLowerCase() === needle,
        );
        if (!hit) {
          fail(outCtx, ExitCode.NOT_FOUND, `No mock server found for '${api}'.`, {
            hint: "Run 'spec0 mock list' to see existing mocks, or 'spec0 mock create --api <name>' to provision one.",
          });
        }

        const result: MockShowResult = {
          apiId: hit.apiId,
          apiName: hit.apiName,
          mockServerId: hit.mockServerId,
          name: hit.name,
          mockUrl: `${authCtx.apiUrl}${hit.mockBaseUrl ?? ""}`,
        };

        emit(outCtx, result, renderShowText);
      } catch (err) {
        failApi(outCtx, err, {
          action: "mock show",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}

function renderShowText(r: MockShowResult): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`mock for ${r.apiName ?? r.apiId ?? "(unknown)"}`));
  lines.push("");
  lines.push(`  name:          ${r.name ?? "—"}`);
  lines.push(`  api id:        ${r.apiId ?? "—"}`);
  lines.push(`  mock server:   ${r.mockServerId ?? "—"}`);
  lines.push(`  mock url:      ${r.mockUrl}`);
  return lines.join("\n");
}
