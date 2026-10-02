/**
 * spec0 log — version history from registry.
 *
 * Migrated to PublicRegistryService.listPublicSpecVersions
 * (`/api/v1/public/registry/{org}/{api}/versions`).
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicRegistryService } from "@spec0/sdk-public-platform";
import type { SpecVersionListItemV1 } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../lib/api-client.js";
import { requireOrgContext } from "../lib/auth-context.js";
import { getDefaultOrgId, getOrgConfig } from "../lib/config.js";
import { parseRegistryRef } from "../lib/registry-ref.js";
import { ExitCode, exit } from "../lib/exit-codes.js";
import { failApi } from "../lib/errors.js";
import { setHttpTrace } from "../lib/http-trace.js";
import { emit, resolveOutputContext, type OutputOptions } from "../lib/output/index.js";
import { renderTable } from "../lib/output/table.js";
import { warnDeprecated } from "../lib/deprecation.js";

export function registerLogCommand(program: Command) {
  program
    .command("log <api-ref>")
    .description(
      "Show published version history. api-ref: api-name (default org) or org-slug/api-name",
    )
    .option("--org <uuid>", "Org id override (auth)")
    .option(
      "--org-slug <slug>",
      "Organisation slug/name for registry path when api-ref has no slash (default: name from spec0 auth config)",
    )
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--json", "Deprecated. Use --output=json instead.")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (apiRef: string, opts: OutputOptions & { org?: string; orgSlug?: string }) => {
      if (opts.json) {
        warnDeprecated({
          what: "the --json flag on `spec0 log`",
          removeIn: "v1.0.0",
          alternative: "--output=json",
        });
      }
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      let orgSlug: string;
      let apiName: string;
      try {
        if (apiRef.includes("/")) {
          const p = parseRegistryRef(apiRef);
          orgSlug = p.org;
          apiName = p.api;
        } else {
          const orgId = process.env.PLATFORM_ORG_ID ?? getDefaultOrgId();
          const cfg = orgId ? getOrgConfig(orgId) : undefined;
          const fallback = cfg?.name?.trim();
          orgSlug = (opts.orgSlug ?? fallback ?? "").trim();
          if (!orgSlug) {
            exit(
              ExitCode.USAGE,
              "Set --org-slug <slug> or use org-slug/api-name, or run 'spec0 auth login'.",
            );
          }
          apiName = apiRef.trim();
        }
      } catch (e) {
        exit(ExitCode.USAGE, (e as Error).message);
      }

      let authCtx;
      try {
        authCtx = requireOrgContext(opts.org);
      } catch (e) {
        exit(ExitCode.AUTH_MISSING, (e as Error).message);
      }

      configureSdkAuth(authCtx);

      try {
        const rows = await PublicRegistryService.listPublicSpecVersions({
          orgSlug,
          apiName,
        });
        emit(outCtx, rows, (data) => renderLogText(data, orgSlug, apiName));
      } catch (err) {
        failApi(outCtx, err, {
          action: "log",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}

function renderLogText(rows: SpecVersionListItemV1[], orgSlug: string, apiName: string): string {
  if (!rows.length) return chalk.yellow("No published versions found.");
  const table = renderTable(rows as unknown as Record<string, unknown>[], [
    { key: "tag", header: "Tag" },
    { key: "publishedAt", header: "Published" },
    { key: "gitSha", header: "Git SHA", format: (v) => String(v ?? "—").slice(0, 12) },
    {
      key: "breakingChangesRecorded",
      header: "Breaking",
      format: (v) => (v ? "yes" : "—"),
    },
  ]);
  const lines: string[] = [chalk.blue(`${orgSlug}/${apiName} version history:`), table];
  for (const r of rows) {
    if (r.breakingChangeSummary) {
      const prev = (r.breakingChangeSummary ?? "").slice(0, 500);
      lines.push("", chalk.gray(`${r.tag}: ${prev}${prev.length >= 500 ? "…" : ""}`));
    }
  }
  return lines.join("\n");
}
