/**
 * spec0 skill install | path
 *
 * Installs the bundled Spec0 skill for Claude Code. A Claude Code skill is a
 * directory under a `skills/` root containing a `SKILL.md`; Claude Code discovers
 * it automatically and loads it when the user's task matches the skill's
 * description. We write it to the personal root (`~/.claude/skills/spec0/`) by
 * default, or the project root (`./.claude/skills/spec0/`) with `--scope project`.
 *
 * The skill teaches Claude Code to be discovery-first against an org's Spec0
 * registry (use the MCP tools to read real specs instead of guessing) and to use
 * the spec0 CLI to publish/lint/mock. Its content lives in lib/skill-content.ts.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ExitCode, exit } from "../lib/exit-codes.js";
import { SPEC0_SKILL_FILE, SPEC0_SKILL_MD, SPEC0_SKILL_NAME } from "../lib/skill-content.js";

type SkillScope = "personal" | "project";

interface SkillInstallOptions {
  scope?: string;
  /** Explicit skills root, overriding scope. Mainly for tests. */
  dir?: string;
}

/**
 * Resolve the `skills/` root for the requested scope. Personal installs land in
 * the user's home (`~/.claude/skills`); project installs in the current working
 * directory (`./.claude/skills`) so they travel with the repo.
 */
function skillsRoot(scope: SkillScope, dirOverride?: string): string {
  if (dirOverride) return dirOverride;
  return scope === "project"
    ? join(process.cwd(), ".claude", "skills")
    : join(homedir(), ".claude", "skills");
}

/**
 * Write the bundled skill to `<root>/spec0/SKILL.md`, creating directories as
 * needed. Overwrites any existing copy (the file is ours to manage, so an
 * upgrade just re-runs install). Returns the path written. Shared with
 * `spec0 setup`.
 */
export function runSkillInstall(opts: SkillInstallOptions = {}): string {
  const scope: SkillScope = opts.scope === "project" ? "project" : "personal";
  const root = skillsRoot(scope, opts.dir);
  const skillDir = join(root, SPEC0_SKILL_NAME);
  const skillPath = join(skillDir, SPEC0_SKILL_FILE);

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, SPEC0_SKILL_MD, "utf-8");
  return skillPath;
}

export function registerSkillCommands(program: Command) {
  const skill = program.command("skill").description("Install the Spec0 skill for Claude Code");

  skill
    .command("install")
    .description("Install the Spec0 skill into Claude Code (~/.claude/skills/spec0)")
    .option("--scope <scope>", "Where to install: personal or project", "personal")
    .action((opts: SkillInstallOptions) => {
      const scope = (opts.scope ?? "personal").toLowerCase();
      if (!["personal", "project"].includes(scope)) {
        console.error(chalk.red(`Unknown scope '${opts.scope}'. Expected: personal or project.`));
        exit(ExitCode.USAGE);
      }

      const skillPath = runSkillInstall({ scope });
      console.log(chalk.green("Claude Code skill:"), `wrote ${skillPath}`);
      console.log("");
      console.log(
        chalk.dim(
          "Restart Claude Code (or reload skills) to pick it up. The skill makes the agent " +
            "discover and read your org's APIs via the Spec0 MCP tools — run 'spec0 mcp install' " +
            "if you haven't connected the MCP server yet.",
        ),
      );
    });

  skill
    .command("path")
    .description("Print where 'spec0 skill install' writes the skill")
    .option("--scope <scope>", "personal or project", "personal")
    .action((opts: SkillInstallOptions) => {
      const scope: SkillScope =
        (opts.scope ?? "personal").toLowerCase() === "project" ? "project" : "personal";
      console.log(join(skillsRoot(scope), SPEC0_SKILL_NAME, SPEC0_SKILL_FILE));
    });
}
