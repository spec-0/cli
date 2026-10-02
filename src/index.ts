#!/usr/bin/env node

import { applyAgentModeEnv, isAgentMode } from "./lib/agent-mode.js";

// Agent mode: apply environment side-effects (NO_COLOR, FORCE_COLOR=0) and
// suppress TTY heuristics before anything else does a capability check. See
// lib/agent-mode.ts for what the mode does and why.
applyAgentModeEnv();
if (isAgentMode()) {
  Object.defineProperty(process.stdout, "isTTY", { value: false });
  Object.defineProperty(process.stderr, "isTTY", { value: false });
}

import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerInitCommand } from "./commands/init.js";
import { registerPublishCommand } from "./commands/publish.js";
import { registerPushCommand } from "./commands/push.js";
import { registerMockCommands } from "./commands/mock/index.js";
import { registerTeamCommands } from "./commands/team/index.js";
import { registerLintCommand } from "./commands/lint.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerLogCommand } from "./commands/log.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerMcpCommands } from "./commands/mcp.js";
import { registerSkillCommands } from "./commands/skill.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerVersionCommand } from "./commands/version.js";
import { registerApiCommands } from "./commands/api/index.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerSyncStatusCommand } from "./commands/sync-status.js";
import { registerCiCommands } from "./commands/ci/index.js";
import { registerCommandsCommand } from "./commands/commands.js";
import { getCliVersion } from "./lib/version.js";
import { notifyUpdateIfAvailable } from "./lib/update-check.js";
import { installHttpInstrumentation } from "./lib/http-trace.js";

// Apply the default request timeout (and wire verbose tracing) to every SDK
// call by wrapping the global fetch once, before any command runs.
installHttpInstrumentation();

const program = new Command();

program
  .name("spec0")
  .description("Manage and publish OpenAPI specs, run mock servers, and lint — powered by Spec0")
  .version(getCliVersion(), "-V, --version", "Print CLI version")
  .helpOption("-h, --help", "Show help")
  // Without this, Commander parses every option in argv at the program level first,
  // including options that appear AFTER the subcommand name. That makes the program-level
  // `--version` option swallow the subcommand-level `--version <value>` option used by
  // `spec0 publish` and `spec0 push`: invoking `spec0 publish --version 1.0.0` would print
  // the CLI's own version and exit with code 0, never running publish. With positional
  // options enabled, options after the subcommand belong to the subcommand parser and the
  // collision goes away.
  .enablePositionalOptions();

registerVersionCommand(program);
registerAuthCommands(program);
registerInitCommand(program);
registerPushCommand(program);
registerPublishCommand(program);
registerMockCommands(program);
registerTeamCommands(program);
registerLintCommand(program);
registerPullCommand(program);
registerSearchCommand(program);
registerDiffCommand(program);
registerLogCommand(program);
registerStatusCommand(program);
registerMcpCommands(program);
registerSkillCommands(program);
registerSetupCommand(program);
registerApiCommands(program);
registerDoctorCommand(program);
registerSyncStatusCommand(program);
registerCiCommands(program);
registerCommandsCommand(program);

// Skip the update-check banner in agent mode — stderr should be clean.
if (!isAgentMode()) {
  notifyUpdateIfAvailable(getCliVersion());
}

program.parse();
