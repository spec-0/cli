/**
 * spec0 api show <ref> — single-API metadata.
 *
 * Prefers the rich internal GET /apis/{apiId}/summary (operations, env configs,
 * subscriber count). A team/public principal (e.g. a SAT) isn't entitled to
 * that endpoint (403) and some ids aren't present there (404), so it falls back
 * to the leaner V1 team-API row, which the same principal can read.
 * Resolves <ref> via ref-resolver: accepts <org>/<api>, bare <api>, or a UUID.
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicApisService } from "@spec0/sdk-public-platform";
import {
  configureSdkAuth,
  createOrgApiClient,
  is401,
  errorStatusCode,
} from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import {
  emit,
  fail,
  progress,
  resolveOutputContext,
  type OutputOptions,
} from "../../lib/output/index.js";
import { resolveRef, resolveApiId, type ResolvedRef } from "../../lib/ref-resolver.js";
import { getDefaultOrgId, getOrgConfig } from "../../lib/config.js";

interface ApiSummary {
  apiId?: string;
  apiName?: string;
  version?: string;
  description?: string;
  status?: string;
  teamId?: string;
  teamName?: string;
  apiURL?: string;
  createdAt?: string;
  updatedAt?: string;
  specSourceType?: string;
  specGithubRepo?: string;
  githubBlobUrl?: string;
  subscriberCount?: number;
  operations?: Array<{ method?: string; path?: string }>;
  apiEnvConfigs?: Array<{ envConfigId?: string; environment?: { name?: string }; url?: string }>;
}

interface ApiSummaryResponse {
  api?: ApiSummary;
}

export function registerApiShowCommand(api: Command) {
  api
    .command("show <ref>")
    .description("Show metadata for a single API (no spec body).")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (ref: string, opts: OutputOptions & { org?: string }) => {
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

      const defaultOrg = (() => {
        const id = process.env.PLATFORM_ORG_ID ?? getDefaultOrgId();
        return id ? getOrgConfig(id)?.name : undefined;
      })();

      let parsed;
      try {
        parsed = resolveRef(ref, { defaultOrg });
      } catch (e) {
        fail(outCtx, ExitCode.USAGE, (e as Error).message);
      }

      configureSdkAuth(authCtx);
      const client = createOrgApiClient(authCtx);

      // resolveApiId hits PublicApisService.listTeamApis (V1) for names; UUIDs
      // pass through. A name miss throws "No API named …" → NOT_FOUND.
      let apiId: string;
      try {
        apiId = await resolveApiId(parsed);
      } catch (err) {
        if (is401(err)) {
          fail(outCtx, ExitCode.AUTH_MISSING, "Token invalid or expired.", {
            hint: "Run 'spec0 auth login' or refresh SPEC0_TOKEN.",
          });
        }
        fail(outCtx, ExitCode.NOT_FOUND, (err as Error).message, {
          hint: "Run 'spec0 api list' to see what exists in this org.",
        });
      }

      let summary: ApiSummary | undefined;
      try {
        const res = (await client.getJson(`/apis/${apiId}/summary`)) as ApiSummaryResponse;
        summary = res.api;
      } catch (err) {
        if (is401(err)) {
          fail(outCtx, ExitCode.AUTH_MISSING, "Token invalid or expired.", {
            hint: "Run 'spec0 auth login' or refresh SPEC0_TOKEN.",
          });
        }
        // 403 (principal not entitled to the internal summary) or 404 (id not
        // on that surface) → fall back to the leaner V1 team-API row. Other
        // statuses map to the stable exit code (5xx → SERVER_ERROR, …).
        const status = errorStatusCode(err);
        if (status === 403 || status === 404) {
          summary = await leanSummaryFromList(apiId, parsed);
          if (summary) {
            progress(
              outCtx,
              chalk.gray(
                "note: limited metadata — operations, environments and subscribers need internal API access.",
              ),
            );
          }
        } else {
          failApi(outCtx, err, {
            action: "api show",
            org: authCtx.orgName ?? authCtx.orgId,
            apiUrl: authCtx.apiUrl,
          });
        }
      }

      if (!summary) {
        fail(outCtx, ExitCode.NOT_FOUND, `No API found for ref '${ref}'.`, {
          hint: "Run 'spec0 api list' to see what exists in this org.",
        });
      }
      emit(outCtx, summary, renderApiShowText);
    });
}

/**
 * Build a lean ApiSummary from the V1 team-API list, used when the rich
 * internal summary is unavailable to the caller (e.g. a team SAT → 403).
 * Matches on the resolved id first, then the name for a `<org>/<api>` ref.
 */
async function leanSummaryFromList(
  apiId: string,
  ref: ResolvedRef,
): Promise<ApiSummary | undefined> {
  let rows: Awaited<ReturnType<typeof PublicApisService.listTeamApis>>;
  try {
    rows = await PublicApisService.listTeamApis();
  } catch {
    // The fallback list is itself unavailable (e.g. an org-key principal has no
    // team → 404). Degrade to "not found" rather than crashing.
    return undefined;
  }
  const wantedName = ref.kind === "name" ? ref.api.toLowerCase() : undefined;
  const row =
    rows.find((r) => r.apiId === apiId) ??
    (wantedName ? rows.find((r) => (r.apiName ?? "").toLowerCase() === wantedName) : undefined);
  if (!row) return undefined;
  return {
    apiId: row.apiId,
    apiName: row.apiName,
    version: row.version ?? undefined,
    description: row.description ?? undefined,
    teamId: row.teamId ?? undefined,
    teamName: row.teamName ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
  };
}

function renderApiShowText(api: ApiSummary): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`${api.apiName ?? "?"} ${chalk.gray(`v${api.version ?? "?"}`)}`));
  if (api.description) lines.push(api.description);
  lines.push("");
  lines.push(`  status:       ${api.status ?? "—"}`);
  lines.push(`  team:         ${api.teamName ?? "—"}`);
  lines.push(`  apiId:        ${api.apiId ?? "—"}`);
  lines.push(`  operations:   ${api.operations?.length ?? 0}`);
  lines.push(`  environments: ${api.apiEnvConfigs?.length ?? 0}`);
  lines.push(`  subscribers:  ${api.subscriberCount ?? 0}`);
  if (api.specSourceType) lines.push(`  specSource:   ${api.specSourceType}`);
  if (api.githubBlobUrl) lines.push(`  github:       ${api.githubBlobUrl}`);
  if (api.updatedAt) lines.push(`  updated:      ${api.updatedAt}`);
  return lines.join("\n");
}
