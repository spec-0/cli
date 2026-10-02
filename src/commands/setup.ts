/**
 * spec0 setup — one-command onboarding.
 *
 * Runs the three things a new user needs, in order, and is safe to re-run:
 *   1. verify auth      (are token + org resolvable? — does not block, just reports)
 *   2. mcp install      (point Cursor/Claude at the Spec0 MCP server)
 *   3. skill install    (install the Spec0 Claude Code skill)
 *
 * Steps 2 and 3 work anonymously; signing in (step 1) is what unlocks the
 * org-scoped MCP tools. We surface that rather than forcing a browser login mid
 * flow, so `spec0 setup` stays non-interactive and CI-safe.
 */

import { Command } from "commander";
import chalk from "chalk";
import { buildDoctorReport } from "../lib/doctor.js";
import { runMcpInstall } from "./mcp.js";
import { runSkillInstall } from "./skill.js";
import { ExitCode, exit } from "../lib/exit-codes.js";

interface SetupOptions {
  client: string;
  scope: string;
}

export function registerSetupCommand(program: Command) {
  program
    .command("setup")
    .description("One command: verify auth, install the MCP server, and install the Claude skill")
    .option("--client <client>", "MCP client: cursor, claude, or all", "all")
    .option("--scope <scope>", "Skill install scope: personal or project", "personal")
    .action((opts: SetupOptions) => {
      const client = opts.client.toLowerCase();
      if (!["cursor", "claude", "all"].includes(client)) {
        console.error(
          chalk.red(`Unknown client '${opts.client}'. Expected: cursor, claude, or all.`),
        );
        exit(ExitCode.USAGE);
      }
      const scope = opts.scope.toLowerCase();
      if (!["personal", "project"].includes(scope)) {
        console.error(chalk.red(`Unknown scope '${opts.scope}'. Expected: personal or project.`));
        exit(ExitCode.USAGE);
      }

      // 1. Auth — report, don't block.
      console.log(chalk.bold("1. Authentication"));
      const report = buildDoctorReport();
      if (report.ok) {
        console.log(
          chalk.green("   ✓ signed in"),
          chalk.dim("— org-scoped MCP tools will be available"),
        );
      } else {
        console.log(chalk.yellow("   • not signed in yet"));
        console.log(
          chalk.dim(
            "     Run 'spec0 auth login' (or set SPEC0_TOKEN + SPEC0_ORG_ID) to unlock your org's APIs.\n" +
              "     The MCP server and skill below still install — anonymous access gets the public docs tools.",
          ),
        );
      }

      // 2. MCP server.
      console.log("");
      console.log(chalk.bold("2. MCP server"));
      runMcpInstall(client);

      // 3. Claude Code skill — only meaningful when Claude is a target client.
      console.log("");
      console.log(chalk.bold("3. Claude Code skill"));
      if (client === "claude" || client === "all") {
        const skillPath = runSkillInstall({ scope });
        console.log(chalk.green("   ✓"), `wrote ${skillPath}`);
      } else {
        console.log(
          chalk.dim(
            "   skipped (the skill is a Claude Code skill; re-run with --client claude or all)",
          ),
        );
      }

      // Summary.
      console.log("");
      console.log(chalk.green("Setup complete."));
      console.log(
        chalk.dim(
          "Restart your editor/agent. On first MCP use a browser opens to sign in (OAuth). " +
            (report.ok ? "" : "Run 'spec0 auth login' to unlock org-scoped tools."),
        ),
      );
      exit(ExitCode.SUCCESS);
    });
}
