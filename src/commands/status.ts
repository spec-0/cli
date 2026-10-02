/**
 * spec0 status — org overview (APIs, mocks, teams, plan).
 *
 * Migrated to `@spec0/sdk-public-platform`:
 *   - org summary  → PublicOrgsService.getOrgSummary  (`/api/v1/public/orgs/summary`)
 *   - mock list    → PublicMocksService.listPublicMocks (`/api/v1/public/mocks`)
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicMocksService, PublicOrgsService } from "@spec0/sdk-public-platform";
import type { MockItemV1 } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../lib/api-client.js";
import { requireOrgContext } from "../lib/auth-context.js";
import { ExitCode, exit } from "../lib/exit-codes.js";
import { failApi } from "../lib/errors.js";
import { setHttpTrace } from "../lib/http-trace.js";
import { emit, resolveOutputContext, type OutputOptions } from "../lib/output/index.js";
import { renderTable } from "../lib/output/table.js";
import { warnDeprecated } from "../lib/deprecation.js";

interface StatusPayload {
  orgName: string;
  apiUrl: string;
  apiCount?: number;
  mockServerCount?: number;
  teamCount?: number;
  plan?: string;
  mocks: MockItemV1[];
}

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show org overview: API count, mock servers, teams, plan")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--json", "Deprecated. Use --output=json instead.")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (opts: OutputOptions & { org?: string }) => {
      if (opts.json) {
        warnDeprecated({
          what: "the --json flag on `spec0 status`",
          removeIn: "v1.0.0",
          alternative: "--output=json",
        });
      }
      const ctx = resolveOutputContext(opts);
      setHttpTrace(ctx.verbose);

      let authCtx;
      try {
        authCtx = requireOrgContext(opts.org);
      } catch (e) {
        exit(ExitCode.AUTH_MISSING, (e as Error).message);
      }

      configureSdkAuth(authCtx);
      try {
        const summary = await PublicOrgsService.getOrgSummary();
        const mocks = await PublicMocksService.listPublicMocks();

        const payload: StatusPayload = {
          orgName: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
          ...summary,
          mocks,
        };

        emit(ctx, payload, (data) => renderStatusText(data));
      } catch (err) {
        failApi(ctx, err, {
          action: "status",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}

function renderStatusText(data: StatusPayload): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`Org: ${data.orgName}`));
  lines.push(`API URL: ${data.apiUrl}`);
  lines.push("");
  lines.push(`  APIs:         ${data.apiCount ?? "—"}`);
  lines.push(`  Mock servers: ${data.mockServerCount ?? data.mocks.length}`);
  lines.push(`  Teams:        ${data.teamCount ?? "—"}`);
  lines.push(`  Plan:         ${data.plan ?? "—"}`);

  if (data.mocks.length > 0) {
    lines.push("");
    lines.push(chalk.blue("Mock servers:"));
    lines.push(
      renderTable(data.mocks as unknown as Record<string, unknown>[], [
        {
          key: "apiName",
          header: "API",
          format: (_, row) => String(row.apiName ?? row.apiId ?? "—"),
        },
        { key: "name", header: "Mock name" },
        { key: "mockBaseUrl", header: "Base path" },
      ]),
    );
  }
  return lines.join("\n");
}
