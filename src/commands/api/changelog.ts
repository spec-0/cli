/**
 * spec0 api changelog <ref> — show what changed between published versions.
 *
 * Defaults to "latest vs previous". Pass --from / --to to diff specific tags.
 *
 * Migrated to @spec0/sdk-public-platform:
 *   - apiId resolution           → resolveApiId (now uses PublicApisService.listTeamApis)
 *   - version-to-version diff    → PublicSpecsService.getVersionDiff
 *   - version listing fallback   → PublicRegistryService.listPublicSpecVersions
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicRegistryService, PublicSpecsService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import {
  emit,
  fail,
  resolveOutputContext,
  type OutputContext,
  type OutputOptions,
} from "../../lib/output/index.js";
import { resolveRef, resolveApiId } from "../../lib/ref-resolver.js";
import { getDefaultOrgId, getOrgConfig } from "../../lib/config.js";

interface ChangelogPayload {
  apiName: string;
  fromTag: string;
  toTag: string;
  hasBreakingChanges: boolean;
  changes: Array<{ id: string; level: string; message: string }>;
}

export function registerApiChangelogCommand(api: Command) {
  api
    .command("changelog <ref>")
    .description("Show changes between published versions of an API.")
    .option("--from <tag>", "Earlier version tag (default: previous published)")
    .option("--to <tag>", "Later version tag (default: latest published)")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, markdown, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(
      async (ref: string, opts: OutputOptions & { from?: string; to?: string; org?: string }) => {
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

        try {
          const apiId = await resolveApiId(parsed);

          const { fromTag, toTag, apiName } = await pickTags(outCtx, apiId, parsed, opts);

          const res = await PublicSpecsService.getVersionDiff({
            apiId,
            fromTag,
            toTag,
          });

          const payload: ChangelogPayload = {
            apiName,
            fromTag,
            toTag,
            hasBreakingChanges: (res.breakingChanges?.length ?? 0) > 0,
            changes: normaliseChanges(res),
          };

          if ((opts.output ?? "").toLowerCase() === "markdown") {
            process.stdout.write(renderChangelogMarkdown(payload) + "\n");
            return;
          }
          emit(outCtx, payload, renderChangelogText);
        } catch (err) {
          if ((err as Error).message?.includes("No API named")) {
            fail(outCtx, ExitCode.NOT_FOUND, (err as Error).message, {
              hint: "Run 'spec0 api list' to see what exists in this org.",
            });
          }
          failApi(outCtx, err, {
            action: "api changelog",
            org: authCtx.orgName ?? authCtx.orgId,
            apiUrl: authCtx.apiUrl,
          });
        }
      },
    );
}

async function pickTags(
  ctx: OutputContext,
  apiId: string,
  parsed: ReturnType<typeof resolveRef>,
  opts: { from?: string; to?: string },
): Promise<{ fromTag: string; toTag: string; apiName: string }> {
  if (opts.from && opts.to) {
    const apiName = parsed.kind === "name" ? parsed.api : apiId;
    return { fromTag: opts.from, toTag: opts.to, apiName };
  }

  // Fall back to the registry to pull the version list. Need org slug + api name.
  if (parsed.kind !== "name" || !parsed.org) {
    fail(
      ctx,
      ExitCode.USAGE,
      "Pass --from <tag> --to <tag>, or use a ref of the form '<org>/<api>' so we can list versions.",
    );
  }
  const versions = await PublicRegistryService.listPublicSpecVersions({
    orgSlug: parsed.org,
    apiName: parsed.api,
  });
  if (versions.length < 2) {
    fail(
      ctx,
      ExitCode.NOT_FOUND,
      `Need at least two published versions to diff. ${parsed.api} has ${versions.length}.`,
    );
  }
  // versions are sorted newest-first by the platform.
  const toTag = opts.to ?? versions[0].tag;
  const fromTag = opts.from ?? versions[1].tag;
  if (!toTag || !fromTag) {
    fail(ctx, ExitCode.GENERIC, "Could not determine version tags from the registry.");
  }
  return { fromTag, toTag, apiName: parsed.api };
}

function normaliseChanges(res: {
  breakingChanges?: Array<Record<string, unknown>>;
}): ChangelogPayload["changes"] {
  const list = res.breakingChanges ?? [];
  return list.map((c) => ({
    id: String(c.id ?? c.text ?? ""),
    level: String(c.level ?? "info"),
    message: String(c.message ?? c.text ?? ""),
  }));
}

function renderChangelogText(p: ChangelogPayload): string {
  const lines: string[] = [];
  const header = `${p.apiName}: ${p.fromTag} → ${p.toTag}`;
  lines.push(chalk.bold(header));
  lines.push(
    p.hasBreakingChanges
      ? chalk.red(`  ✗ ${p.changes.length} breaking change${p.changes.length === 1 ? "" : "s"}`)
      : chalk.green(`  ✓ no breaking changes`),
  );
  if (p.changes.length) {
    lines.push("");
    for (const c of p.changes) {
      const tag = c.level === "error" ? chalk.red("[breaking]") : chalk.gray(`[${c.level}]`);
      lines.push(`  ${tag} ${c.id}${c.message ? `: ${c.message}` : ""}`);
    }
  }
  return lines.join("\n");
}

function renderChangelogMarkdown(p: ChangelogPayload): string {
  const lines: string[] = [];
  lines.push(`## ${p.apiName} — ${p.fromTag} → ${p.toTag}`);
  lines.push("");
  if (p.hasBreakingChanges) {
    lines.push(`**${p.changes.length} breaking change(s).**`);
  } else {
    lines.push("No breaking changes.");
  }
  if (p.changes.length) {
    lines.push("");
    for (const c of p.changes) {
      lines.push(`- \`${c.id}\` — ${c.message || "(no description)"}`);
    }
  }
  return lines.join("\n");
}
