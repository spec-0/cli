/**
 * spec0 push — zero-config push of an OpenAPI spec to the platform (team-scoped, private).
 *
 * The primary publish command for the GitOps workflow:
 *   spec0 push openapi.yaml
 *   spec0 push openapi.yaml --name payment-api
 *   spec0 push openapi.yaml --semver
 *
 * Name resolution order: --name > basename(specFilePath) > error
 * Version resolution order: --version > info.version in spec > default 0.1.0
 * Team resolution order: --team > "Unassigned APIs" (backend default, reassign later)
 * Git SHA: --git-sha > CI env > local `git log -1 -- <file>`
 *
 * `spec0 register` is a backward-compat alias for this command.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync, readFileSync } from "fs";
import { basename, extname, relative, resolve } from "path";
import { runSpectral } from "../lib/lint.js";
import { formatLintText, formatPublishText, formatGitHubAnnotation } from "../lib/output.js";
import { PublicApisService, PublicMocksService } from "@spec0/sdk-public-platform";
import type { TeamPublishRequestV1 } from "@spec0/sdk-public-platform";
import {
  configureSdkAuth,
  errorStatusCode,
  extractErrorMessage,
  is401,
  is402,
} from "../lib/api-client.js";
import { requireOrgContext } from "../lib/auth-context.js";
import { ExitCode, exit, exitCodeForHttpStatus } from "../lib/exit-codes.js";
import { resolveCliSpecPathFromFlags } from "../lib/cli-spec-path.js";
import { resolvedPlatformAppUrl } from "../lib/platform-defaults.js";
import { resolveGitProvenance } from "../lib/git-provenance.js";

const TEAM_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function validateTeamArg(team: string): string | null {
  const t = team.trim();
  if (!t) return "Missing --team value.";
  if (isUuid(t)) return null;
  if (!TEAM_SLUG_PATTERN.test(t)) {
    return `Invalid --team '${team}'. Use a UUID or slug like 'platform-team' (lowercase, hyphens, no spaces).`;
  }
  return null;
}

/** Derive API name from spec filename: "api/payment-api.yaml" → "payment-api" */
function nameFromSpecPath(specPath: string): string | null {
  const base = basename(specPath);
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  // Only return if it already looks like a valid slug
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

function usageExamples(cmd: string): string {
  return [
    "Examples:",
    `  spec0 ${cmd} openapi.yaml`,
    `  spec0 ${cmd} openapi.yaml --name payment-api`,
    `  spec0 ${cmd} openapi.yaml --name payment-api --team platform-team`,
    `  spec0 ${cmd} openapi.yaml --semver`,
    `  spec0 ${cmd} openapi.yaml --env staging`,
    `  spec0 ${cmd} openapi.yaml --version 1.2.0 --git-sha $(git rev-parse HEAD)`,
  ].join("\n");
}

async function runPush(
  cmdName: string,
  specArg: string | undefined,
  opts: Record<string, string | boolean>,
  command: Command,
) {
  const cwd = process.cwd();
  const specPath = resolveCliSpecPathFromFlags(
    command,
    cwd,
    opts.specFile as string | undefined,
    specArg,
  );

  if (!specPath || !existsSync(specPath)) {
    console.error(
      chalk.red("Spec file not found. Pass a path as the first argument or via --spec-file.\n"),
    );
    console.error(chalk.yellow(usageExamples(cmdName)));
    exit(ExitCode.USAGE);
  }

  const apiId = opts["apiId"] as string | undefined;
  const nameOpt = opts.name as string | undefined;
  const team = opts.team as string | undefined;
  const versionOpt = opts.version as string | undefined;
  const semver = !!(opts.semver as boolean);
  const strict = !!(opts.strict as boolean);
  const skipLint = !!(opts.skipLint as boolean);
  const verbose = !!(opts.verbose as boolean);
  const format = (opts.format as string) ?? "text";
  const dryRun = !!(opts.dryRun as boolean);

  const vLog = (msg: string) => {
    if (verbose) console.error(chalk.gray(`[verbose] ${msg}`));
  };

  // ── Name resolution ────────────────────────────────────────────────────────
  // --name > basename(specFilePath) — never from info.title
  const resolvedName = nameOpt?.trim() ?? nameFromSpecPath(specPath);
  if (!apiId && !resolvedName) {
    console.error(chalk.red("Cannot derive API name from spec path. Use --name payment-api.\n"));
    console.error(chalk.yellow(usageExamples(cmdName)));
    exit(ExitCode.USAGE);
  }

  // ── Team validation (optional) ─────────────────────────────────────────────
  if (team) {
    const teamErr = validateTeamArg(team);
    if (teamErr) {
      console.error(chalk.red(`${teamErr}\n`));
      exit(ExitCode.USAGE);
    }
  }

  // ── Git provenance resolution ──────────────────────────────────────────────
  // See `lib/git-provenance.ts` — each field resolves independently with
  // priority: explicit flag > CI env > local git. Independent resolution lets
  // `--git-sha` be passed alongside auto-derived `githubRepo` + `githubBranch`
  // (common in GitHub Actions where the workflow has the authoritative SHA).
  const { gitSha, githubRepo, githubBranch } = resolveGitProvenance(
    {
      gitSha: opts["gitSha"] as string | undefined,
      githubRepo: opts["githubRepo"] as string | undefined,
      githubBranch: opts["githubBranch"] as string | undefined,
    },
    specPath,
  );
  if (gitSha) {
    vLog(`git sha: ${gitSha.slice(0, 8)}…`);
  }

  // ── Lint gate ─────────────────────────────────────────────────────────────
  const spinner = ora("Linting…").start();
  if (!skipLint) {
    try {
      const lintResult = await runSpectral(specPath);
      if (lintResult.errors.length === 0) {
        spinner.succeed("Lint passed");
      } else {
        spinner.fail("Lint failed");
      }
      if (format === "github") {
        for (const e of lintResult.errors)
          console.log(formatGitHubAnnotation(specPath, e.line ?? 0, "error", e.message));
        for (const w of lintResult.warnings)
          console.log(formatGitHubAnnotation(specPath, w.line ?? 0, "warning", w.message));
      } else if (format !== "json") {
        console.log(formatLintText(lintResult));
      }
      if (lintResult.errors.length > 0) {
        console.error(chalk.red("Lint errors block push. Fix them or use --skip-lint."));
        exit(ExitCode.VALIDATION);
      }
      if (strict && lintResult.warnings.length > 0) {
        console.error(chalk.red("Strict mode: lint warnings block push."));
        exit(ExitCode.VALIDATION);
      }
    } catch (e) {
      spinner.fail("Lint check failed");
      console.error(e);
      exit(ExitCode.GENERIC);
    }
  } else {
    spinner.succeed("Lint skipped");
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let ctx;
  try {
    ctx = requireOrgContext(opts.org as string | undefined);
  } catch (e) {
    console.error(chalk.red((e as Error).message));
    exit(ExitCode.AUTH_MISSING);
  }

  const openapiSpec = readFileSync(specPath, "utf-8");
  const specFilePath = relative(cwd, resolve(specPath));

  if (dryRun) {
    console.log(
      chalk.green(
        `Dry run — would push: name=${resolvedName ?? apiId ?? "new"} team=${team ?? "(unassigned)"} version=${versionOpt ?? "(from spec)"} sha=${gitSha ? gitSha.slice(0, 8) + "…" : "none"}`,
      ),
    );
    return;
  }

  // ── API call ─────────────────────────────────────────────────────────────
  configureSdkAuth(ctx);
  const environment = (opts["env"] as string | undefined)?.trim() || undefined;
  // `environment` is a forward-compatible field on the publish request: when set, the platform
  // advances that environment's current version to this publish. Declared via an intersection until
  // the published SDK type carries it; the request body is sent verbatim either way.
  const body: TeamPublishRequestV1 & { environment?: string } = {
    apiId,
    name: resolvedName ?? undefined,
    team: team || undefined,
    version: versionOpt || undefined,
    openapiSpec,
    gitSha: gitSha || undefined,
    githubRepo: githubRepo || undefined,
    githubBranch: githubBranch || undefined,
    specFilePath,
    semver,
    environment,
  };

  vLog(`POST ${ctx.apiUrl}/api/v1/public/apis/team`);
  vLog(
    `payload: name=${resolvedName} team=${team ?? "(unassigned)"} version=${versionOpt ?? "(from spec)"} sha=${gitSha ? gitSha.slice(0, 8) + "…" : "none"} semver=${semver} env=${environment ?? "(none)"}`,
  );

  const pushSpinner = ora("Pushing…").start();
  try {
    const reg = await PublicApisService.publishTeamApi({ requestBody: body });

    pushSpinner.stop();

    vLog(
      `response: apiId=${reg.apiId} apiName=${reg.apiName ?? "-"} version=${reg.version ?? "-"} created=${reg.created} noChanges=${reg.noChanges} versionUnchanged=${reg.versionUnchanged}`,
    );

    const resolvedApiId = reg.apiId ?? "";
    const appBase = resolvedPlatformAppUrl();
    const specUrl = `${appBase}/apis/${resolvedApiId}`;

    let mockUrl: string | undefined;
    try {
      const mocks = await PublicMocksService.listPublicMocks();
      const hit = mocks.find((m) => m.apiId === resolvedApiId);
      if (hit?.mockBaseUrl) {
        mockUrl = `${ctx.apiUrl}${hit.mockBaseUrl}`;
      }
    } catch {
      /* best-effort */
    }

    const displayVersion = reg.version ?? versionOpt ?? "?";
    const displayName = reg.apiName ?? resolvedName ?? resolvedApiId;
    // Non-blocking org governance warnings, surfaced when the org runs governance in warn mode.
    const governanceWarnings =
      (reg as { governanceWarnings?: Array<{ section?: string; message?: string }> })
        .governanceWarnings ?? [];

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            apiId: resolvedApiId,
            apiName: reg.apiName ?? null,
            version: displayVersion,
            created: reg.created ?? false,
            versionCreated: reg.versionCreated ?? false,
            noChanges: reg.noChanges ?? false,
            versionUnchanged: reg.versionUnchanged ?? false,
            versionUnchangedHint: reg.versionUnchangedHint ?? null,
            teamName: reg.teamName ?? null,
            orgSlug: reg.orgSlug ?? null,
            registryUrl: reg.registryUrl ?? null,
            governanceWarnings,
            specUrl,
            mockUrl: mockUrl ?? null,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        formatPublishText({
          apiId: resolvedApiId,
          apiName: displayName,
          version: displayVersion,
          specUrl,
          mockUrl,
          teamName: reg.teamName,
          registryUrl: reg.registryUrl,
          noChanges: reg.noChanges,
          versionUnchanged: reg.versionUnchanged,
          versionUnchangedHint: reg.versionUnchangedHint,
          created: reg.created,
          governanceWarnings,
        }),
      );
    }
  } catch (err) {
    pushSpinner.fail("Push failed");
    if (is401(err)) {
      const errBody = (err as { response?: { body?: unknown } })?.response?.body;
      const errCode =
        typeof errBody === "object" && errBody !== null
          ? (errBody as Record<string, unknown>)["error"]
          : undefined;
      if (errCode === "API_KEY_EXPIRED") {
        console.error(
          chalk.red("Your API key has expired. Run 'spec0 auth login' to re-authenticate."),
        );
      } else {
        console.error(
          chalk.red("Authentication failed. Run 'spec0 auth login' to re-authenticate."),
        );
      }
      exit(ExitCode.AUTH_MISSING);
    }
    if (is402(err)) {
      const msg = extractErrorMessage(err) ?? "You've reached your plan limit.";
      console.error(chalk.red(`Plan limit reached: ${msg}`));
      console.error(chalk.yellow("Upgrade your plan at your org settings."));
      // 402 isn't in the stable exit-code table; closest semantic is permission-denied.
      exit(ExitCode.PERMISSION_DENIED);
    }
    const status = errorStatusCode(err);
    const detail = extractErrorMessage(err) ?? (err as Error).message ?? String(err);
    console.error(chalk.red(`Push failed: ${detail}\n`));
    console.error(chalk.yellow(usageExamples(cmdName)));
    exit(exitCodeForHttpStatus(status));
  }
}

export function registerPushCommand(program: Command) {
  program
    .command("push")
    .description("Push an OpenAPI spec to the platform (team-scoped, private)")
    .argument("[spec-file]", "Path to OpenAPI spec file (or use --spec-file)")
    .option("--spec-file <path>", "Path to OpenAPI spec file")
    .option("--name <name>", "API name (kebab-case). Defaults to spec filename if omitted.")
    .option("--team <team>", "Team UUID or slug. Defaults to 'Unassigned APIs' if omitted.")
    .option("--version <version>", "Version tag (e.g. 1.2.0). Defaults to info.version in spec.")
    .option(
      "--env <environment>",
      "Target environment (e.g. staging, production). Advances that environment to this published version.",
    )
    .option("--api-id <id>", "Existing API UUID to update (backward compat; prefer --name)")
    .option("--semver", "Auto-compute next semver via oasdiff diff classification")
    .option("--git-sha <sha>", "Git commit SHA (auto-detected if .git is present)")
    .option("--github-repo <repo>", "GitHub repository URL for provenance")
    .option("--github-branch <branch>", "GitHub branch for provenance")
    .option("--strict", "Fail on any Spectral lint warning")
    .option("--skip-lint", "Skip lint gate")
    .option("--dry-run", "Validate and print what would be sent, without pushing")
    .option("--verbose", "Print verbose request/response logs")
    .option("--format <fmt>", "Output format: text, json, github", "text")
    .option("--org <org>", "Override default org (UUID)")
    .action(async (specArg, opts, command) => {
      await runPush("push", specArg, opts, command);
    });
}
