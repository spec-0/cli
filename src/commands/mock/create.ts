/**
 * spec0 mock create — provision (or fetch) the default mock server for an API.
 *
 * Migrated to `@spec0/sdk-public-platform` (`PublicMocksService.createPublicMock`)
 * which targets the versioned `/api/v1/public/mocks` surface. The endpoint
 * is idempotent: POST either returns the existing mock or creates a fresh one.
 * The API key is only ever returned once (on initial creation), so CI callers
 * should capture it on the very first run — we surface it prominently in text
 * mode and include it in the JSON payload.
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicMocksService, type CreateMockRequestV1 } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import { emit, fail, resolveOutputContext, type OutputOptions } from "../../lib/output/index.js";

interface CreateMockResult {
  apiId?: string;
  apiName?: string;
  mockUrl: string;
  apiKey?: string | null;
  created?: boolean;
}

export function registerMockCreateCommand(mock: Command) {
  mock
    .command("create")
    .description("Create (or fetch existing) mock server for an API; print URL and one-time key.")
    .option("--api <name>", "API name (required unless --api-id is set)")
    .option("--api-id <uuid>", "API id")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (opts: OutputOptions & { api?: string; apiId?: string; org?: string }) => {
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      if (!opts.api && !opts.apiId) {
        fail(outCtx, ExitCode.USAGE, "Provide --api <name> or --api-id <uuid>.");
      }

      let authCtx;
      try {
        authCtx = requireOrgContext(opts.org);
      } catch (e) {
        fail(outCtx, ExitCode.AUTH_MISSING, (e as Error).message, {
          hint: "Set SPEC0_TOKEN + SPEC0_ORG_ID, or run 'spec0 auth login'.",
        });
      }

      configureSdkAuth(authCtx);
      const requestBody: CreateMockRequestV1 = {
        apiName: opts.api,
        apiId: opts.apiId,
      };

      try {
        const res = await PublicMocksService.createPublicMock({ requestBody });

        const result: CreateMockResult = {
          // The SDK's CreateMockResponseV1 doesn't model `apiId` (it's not in the
          // public OpenAPI contract); we surface whatever the caller passed so the
          // JSON shape stays stable for CI consumers.
          apiId: opts.apiId,
          apiName: res.apiName,
          mockUrl: `${authCtx.apiUrl}${res.mockBaseUrl ?? ""}`,
          apiKey: res.apiKey ?? null,
          created: res.created,
        };

        emit(outCtx, result, renderCreateText);
      } catch (err) {
        failApi(outCtx, err, {
          action: "mock create",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}

function renderCreateText(r: CreateMockResult): string {
  const lines: string[] = [];
  lines.push(chalk.green(r.created ? "Mock server created:" : "Mock server (existing):"));
  lines.push(`  Mock URL:  ${r.mockUrl}`);
  if (r.apiKey) {
    lines.push(`  API Key:   ${r.apiKey}  ${chalk.yellow("(shown once — copy and keep safe)")}`);
  } else {
    lines.push(chalk.gray("  (API key was issued when the mock was first created.)"));
  }
  return lines.join("\n");
}
