/**
 * spec0 api delete <ref> — delete a team-scoped API.
 *
 * Uses PublicApisService.deleteTeamApi (`DELETE /api/v1/public/apis/team/{apiId}`).
 * Resolves <ref> (name or UUID) via the shared ref-resolver. Requires `--yes`.
 * Mirrors `spec0 team delete`'s destructive-op contract.
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicApisService } from "@spec0/sdk-public-platform";
import { configureSdkAuth, errorStatusCode } from "../../lib/api-client.js";
import { requireOrgContext } from "../../lib/auth-context.js";
import { ExitCode } from "../../lib/exit-codes.js";
import { failApi } from "../../lib/errors.js";
import { setHttpTrace } from "../../lib/http-trace.js";
import {
  fail,
  progress,
  resolveOutputContext,
  type OutputOptions,
} from "../../lib/output/index.js";
import { resolveRef, resolveApiId } from "../../lib/ref-resolver.js";

export function registerApiDeleteCommand(api: Command) {
  api
    .command("delete <ref>")
    .description("Delete a team-scoped API (name or UUID). Requires --yes.")
    .option("--yes", "Skip the confirmation prompt (required for non-interactive use)")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (ref: string, opts: OutputOptions & { yes?: boolean; org?: string }) => {
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      if (!ref.trim()) {
        fail(outCtx, ExitCode.USAGE, "API ref is required.");
      }
      if (!opts.yes) {
        fail(
          outCtx,
          ExitCode.USAGE,
          "Refusing to delete without confirmation. Pass --yes to proceed.",
          { hint: "spec0 api delete <ref> --yes" },
        );
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

      let apiId: string;
      try {
        apiId = await resolveApiId(resolveRef(ref, { defaultOrg: authCtx.orgName }));
      } catch (e) {
        fail(outCtx, ExitCode.NOT_FOUND, (e as Error).message, {
          hint: "Run 'spec0 api list' to see what exists in this org.",
        });
      }

      try {
        await PublicApisService.deleteTeamApi({ apiId });
        progress(outCtx, chalk.green(`✓ Deleted API ${ref} (${apiId})`));
      } catch (err) {
        const status = errorStatusCode(err);
        if (status === 404) {
          fail(outCtx, ExitCode.NOT_FOUND, `API ${ref} not found.`, {
            hint: "Run 'spec0 api list' to see what exists in this org.",
          });
        }
        failApi(outCtx, err, {
          action: "api delete",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}
