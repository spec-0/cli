/**
 * spec0 diff — compare two OpenAPI specs (registry refs and/or local files).
 *
 * Migrated to @spec0/sdk-public-platform:
 *   - registry fetch         → PublicRegistryService.getLatestPublicSpec / getPublicSpecByTag
 *   - breaking-change check  → PublicSpecsService.diffSpecs (multipart)
 */

import { Command } from "commander";
import chalk from "chalk";
import { createTwoFilesPatch } from "diff";
import { PublicSpecsService } from "@spec0/sdk-public-platform";
import {
  configureSdkAuth,
  errorStatusCode,
  extractErrorMessage,
  is401,
} from "../lib/api-client.js";
import { requireOrgContext, type ResolvedOrgContext } from "../lib/auth-context.js";
import { loadSpecContent } from "../lib/spec-source.js";
import { ExitCode, exit, exitCodeForHttpStatus } from "../lib/exit-codes.js";

async function breakingChangesViaBackend(
  ctx: ResolvedOrgContext,
  leftContent: string,
  rightContent: string,
): Promise<void> {
  configureSdkAuth(ctx);
  const result = await PublicSpecsService.diffSpecs({
    formData: {
      base: new Blob([leftContent], { type: "application/yaml" }),
      revision: new Blob([rightContent], { type: "application/yaml" }),
    },
  });

  if (!result.hasBreakingChanges) {
    console.log(chalk.green("No breaking changes detected."));
    return;
  }

  console.log(chalk.red(`Breaking changes detected:`));
  if (result.breakingChanges?.length) {
    for (const bc of result.breakingChanges as Record<string, unknown>[]) {
      const id = bc["id"] ?? bc["text"] ?? JSON.stringify(bc);
      const level = bc["level"] ?? "";
      const msg = bc["message"] ?? bc["text"] ?? "";
      console.log(chalk.red(`  [${level}] ${id}${msg ? ": " + msg : ""}`));
    }
  }
}

export function registerDiffCommand(program: Command) {
  program
    .command("diff")
    .description(
      "Diff two specs: each side is a file path or registry ref org/api[@tag] (latest if tag omitted)",
    )
    .argument("<a>", "Left: local path or org/api[@tag]")
    .argument("<b>", "Right: local path or org/api[@tag]")
    .option("--breaking-only", "Show breaking changes only (via backend oasdiff service)")
    .option("--org <uuid>", "Org id override for registry fetches")
    .action(async (a: string, b: string, opts: { breakingOnly?: boolean; org?: string }) => {
      let ctx;
      try {
        ctx = requireOrgContext(opts.org);
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        exit(ExitCode.AUTH_MISSING);
      }

      let left: string;
      let right: string;
      try {
        left = await loadSpecContent(a, ctx);
        right = await loadSpecContent(b, ctx);
      } catch (err) {
        if (is401(err)) {
          console.error(chalk.red("Token invalid. Run 'spec0 auth login'."));
          exit(ExitCode.AUTH_MISSING);
        }
        const status = errorStatusCode(err);
        console.error(chalk.red(`Failed to load spec: ${(err as Error).message}`));
        exit(status ? exitCodeForHttpStatus(status) : ExitCode.GENERIC);
      }

      if (opts.breakingOnly) {
        try {
          await breakingChangesViaBackend(ctx, left, right);
        } catch (err) {
          if (is401(err)) {
            console.error(chalk.red("Token invalid. Run 'spec0 auth login'."));
            exit(ExitCode.AUTH_MISSING);
          }
          const status = errorStatusCode(err);
          const msg = extractErrorMessage(err) ?? (err as Error).message;
          console.error(chalk.red(`Breaking change check failed: ${msg}`));
          exit(status ? exitCodeForHttpStatus(status) : ExitCode.GENERIC);
        }
        return;
      }

      const patch = createTwoFilesPatch(a, b, left, right, "", "", { context: 3 });
      if (!patch.trim()) {
        console.log(chalk.green("No textual differences."));
        return;
      }
      process.stdout.write(patch);
    });
}
