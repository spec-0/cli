/**
 * spec0 api list — catalogue view of APIs in the org.
 *
 * Migrated to PublicApisService.listTeamApis (`/api/v1/public/apis/team`).
 * The V1 surface is leaner than the legacy `/apis/summary` (no operation /
 * environment / subscriber counts and no `status` field). The `--status`
 * filter and those columns are dropped accordingly.
 */

import { Command } from "commander";
import { PublicApisService } from "@spec0/sdk-public-platform";
import type { ApiTeamListItemV1 } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import { emit, fail, resolveOutputContext, type OutputOptions } from "../../lib/output/index.js";
import { renderTable } from "../../lib/output/table.js";

export function registerApiListCommand(api: Command) {
  api
    .command("list")
    .description("List APIs in your organisation (catalogue view).")
    .option("--team <team>", "Filter by team name (case-insensitive)")
    .option("--search <query>", "Filter by name substring (case-insensitive)")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(
      async (
        opts: OutputOptions & {
          team?: string;
          search?: string;
          org?: string;
        },
      ) => {
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
          const rows = await PublicApisService.listTeamApis();
          const filtered = filterApis(rows, opts);
          emit(outCtx, filtered, renderApiListText);
        } catch (err) {
          failApi(outCtx, err, {
            action: "api list",
            org: authCtx.orgName ?? authCtx.orgId,
            apiUrl: authCtx.apiUrl,
          });
        }
      },
    );
}

function filterApis(
  rows: ApiTeamListItemV1[],
  opts: { team?: string; search?: string },
): ApiTeamListItemV1[] {
  let out = rows;
  if (opts.team) {
    const t = opts.team.toLowerCase();
    out = out.filter((r) => (r.teamName ?? "").toLowerCase() === t);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter((r) => (r.apiName ?? "").toLowerCase().includes(q));
  }
  return out;
}

function renderApiListText(rows: ApiTeamListItemV1[]): string {
  if (!rows.length) return "No APIs found. Use `spec0 push` to add one.";
  return renderTable(rows as unknown as Record<string, unknown>[], [
    { key: "apiName", header: "Name" },
    { key: "version", header: "Ver" },
    { key: "teamName", header: "Team" },
    { key: "updatedAt", header: "Updated" },
  ]);
}
