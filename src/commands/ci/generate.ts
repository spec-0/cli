/**
 * spec0 ci generate github — emit a ready-to-commit GitHub Actions workflow.
 *
 * Migrated to PublicCiService.generateCiConfig (`/api/v1/public/ci/config`).
 * The backend renders the workflow YAML (including auth-secret references
 * and the spec path filter), so the user just needs to drop it into
 * `.github/workflows/`.
 */

import { Command } from "commander";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import chalk from "chalk";
import { PublicCiService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../../lib/api-client.js";
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

export function registerCiGenerateCommand(ci: Command) {
  ci.command("generate")
    .argument("<provider>", "CI provider (currently supported: github)")
    .description("Generate a workflow file for <provider> that runs 'spec0 publish' on push.")
    .option("--spec-file <path>", "Path to OpenAPI spec file", "openapi.yaml")
    .option("--api-name <name>", "API name to embed in the workflow (default: spec filename)")
    .option("--branch <branch>", "Git branch that triggers the workflow", "main")
    .option("--write", "Write the workflow to its suggested path (default: print to stdout)")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format for metadata: text, json, yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(
      async (
        provider: string,
        opts: OutputOptions & {
          specFile: string;
          apiName?: string;
          branch: string;
          write?: boolean;
          org?: string;
        },
      ) => {
        const outCtx = resolveOutputContext(opts);
        setHttpTrace(outCtx.verbose);

        if (provider.toLowerCase() !== "github") {
          fail(outCtx, ExitCode.USAGE, `Unsupported CI provider '${provider}'.`, {
            hint: "Supported providers: github.",
          });
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
          const res = await PublicCiService.generateCiConfig({
            specFilePath: opts.specFile,
            apiName: opts.apiName,
            branch: opts.branch,
          });

          if (opts.write) {
            const target = resolve(
              process.cwd(),
              res.filePath ?? ".github/workflows/spec0-publish.yml",
            );
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, res.workflowYaml ?? "", "utf-8");
            progress(outCtx, chalk.green(`wrote ${target}`));
            emit(
              outCtx,
              { filePath: target, bytes: (res.workflowYaml ?? "").length },
              (d) => `Workflow written to ${d.filePath} (${d.bytes} bytes).`,
            );
          } else {
            // Dump the raw YAML on stdout so users can redirect to a file.
            process.stdout.write(res.workflowYaml ?? "");
          }
        } catch (err) {
          failApi(outCtx, err, {
            action: "ci generate",
            org: authCtx.orgName ?? authCtx.orgId,
            apiUrl: authCtx.apiUrl,
          });
        }
      },
    );
}
