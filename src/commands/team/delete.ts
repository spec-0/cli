/**
 * spec0 team delete <teamId> — hard-delete a team.
 *
 * Uses PublicTeamsService.deleteTeam (`DELETE /api/v1/public/teams/{teamId}`).
 * Refuses non-empty teams with 409 (caller must delete the team's APIs / mocks
 * first). Requires `admin:team` scope on the calling token.
 *
 * Defensive: requires `--yes` (or `--name <name>` matching the team's name) to
 * confirm. Backoffice / staff destructive-op pattern; we want the same here.
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicTeamsService } from "@spec0/sdk-public-platform";
import { configureSdkAuth, errorStatusCode, extractErrorMessage } from "../../lib/api-client.js";
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

export function registerTeamDeleteCommand(team: Command) {
  team
    .command("delete <teamId>")
    .description("Delete a team. Refuses non-empty teams (delete child APIs/mocks first).")
    .option("--yes", "Skip the confirmation prompt (required for non-interactive use)")
    .option("--org <uuid>", "Org id override")
    .option("--output <format>", "Output format: text, json, or yaml (default: text)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(async (teamId: string, opts: OutputOptions & { yes?: boolean; org?: string }) => {
      const outCtx = resolveOutputContext(opts);
      setHttpTrace(outCtx.verbose);

      if (!teamId.trim()) {
        fail(outCtx, ExitCode.USAGE, "Team id is required.");
      }
      if (!opts.yes) {
        fail(
          outCtx,
          ExitCode.USAGE,
          "Refusing to delete without confirmation. Pass --yes to proceed.",
          { hint: "spec0 team delete <teamId> --yes" },
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
      try {
        await PublicTeamsService.deleteTeam({ teamId });
        progress(outCtx, chalk.green(`✓ Deleted team ${teamId}`));
      } catch (err) {
        const status = errorStatusCode(err);
        const msg = extractErrorMessage(err) ?? (err as Error).message;
        if (status === 404) {
          fail(outCtx, ExitCode.NOT_FOUND, `Team ${teamId} not found.`, {
            hint: "Run 'spec0 team list' to see what exists in this org.",
          });
        }
        if (status === 409) {
          fail(outCtx, ExitCode.GENERIC, `Team is not empty: ${msg}`, {
            hint: "Delete the team's APIs and mocks first.",
          });
        }
        failApi(outCtx, err, {
          action: "team delete",
          org: authCtx.orgName ?? authCtx.orgId,
          apiUrl: authCtx.apiUrl,
        });
      }
    });
}
