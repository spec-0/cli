/**
 * spec0 mock refresh <api> — rebuild a mock server against the API's current spec.
 *
 * A mock is generated from the spec it was created with, so publishing a new
 * version of an API leaves its mock answering the previous contract. This
 * rebuilds it.
 *
 * The mock keeps its id, URL and API key, so anything already pointing at it —
 * CI config, exported shell variables, a teammate's bookmark — keeps working.
 *
 * Like `mock show` and `mock delete`, the mock server id is resolved by listing
 * mocks and matching on API name or id, since there is no lookup by API alone.
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

interface RefreshMockResult {
  apiName?: string;
  mockServerId: string;
  /** The spec version the mock now answers with. */
  specVersion?: string | null;
  /** False when the mock was already serving the current spec. */
  refreshed: boolean;
  customVariantsCarriedOver?: number;
  customVariantsDropped?: string[];
}

export function registerMockRefreshCommand(mock: Command) {
  mock
    .command("refresh <api>")
    .description(
      "Rebuild the mock for <api> (name or UUID) against its current spec. URL and key are unchanged.",
    )
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (api: string, opts: OutputOptions & { org?: string }) => {
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      if (!api.trim()) {
        fail(outCtx, ExitCode.USAGE, "API ref is required.");
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
      try {
        const rows = await PublicMocksService.listPublicMocks();
        const needle = api.toLowerCase();
        const hit = rows.find(
          (r) =>
            (r.apiName ?? "").toLowerCase() === needle || (r.apiId ?? "").toLowerCase() === needle,
        );
        if (!hit?.mockServerId) {
          fail(outCtx, ExitCode.NOT_FOUND, `No mock server found for '${api}'.`, {
            hint: "Run 'spec0 mock list' to see existing mocks, or 'spec0 mock create' to make one.",
          });
        }

        const res = await PublicMocksService.refreshPublicMock({
          mockServerId: hit.mockServerId,
        });

        emit(
          outCtx,
          {
            apiName: hit.apiName,
            mockServerId: hit.mockServerId,
            specVersion: res.specVersion ?? null,
            refreshed: res.refreshed ?? false,
            customVariantsCarriedOver: res.customVariantsCarriedOver,
            customVariantsDropped: res.customVariantsDropped,
          } satisfies RefreshMockResult,
          renderRefreshText,
        );
      } catch (err) {
        failApi(outCtx, err, {
          action: "mock refresh",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}

function renderRefreshText(r: RefreshMockResult): string {
  const name = r.apiName ?? r.mockServerId;
  const version = r.specVersion ? ` (${r.specVersion})` : "";

  if (!r.refreshed) {
    return chalk.gray(
      `Mock for ${name} is already serving the current spec${version}. Nothing changed.`,
    );
  }

  const lines = [chalk.green(`✓ Rebuilt the mock for ${name}${version}`)];
  lines.push(chalk.gray("  Same URL and API key — anything pointing at it keeps working."));

  if (r.customVariantsCarriedOver) {
    lines.push(`  ${r.customVariantsCarriedOver} custom response variant(s) carried over`);
  }
  // Reported rather than dropped silently: these were hand-written, and their
  // operation no longer exists in the spec.
  const dropped = r.customVariantsDropped ?? [];
  if (dropped.length) {
    lines.push(
      chalk.yellow(`  ${dropped.length} custom variant(s) could not be carried over:`),
      ...dropped.map((d) => chalk.yellow(`    - ${d}`)),
      chalk.gray("  Their operation is no longer in the spec."),
    );
  }
  return lines.join("\n");
}
