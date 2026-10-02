/**
 * spec0 mock … — mock-server subcommands.
 *
 * Split from the previous monolithic mock.ts so each verb owns its flags,
 * exit codes, and output contract.
 */

import { Command } from "commander";
import { registerMockCreateCommand } from "./create.js";
import { registerMockListCommand } from "./list.js";
import { registerMockShowCommand } from "./show.js";
import { registerMockUrlCommand } from "./url.js";
import { registerMockDeleteCommand } from "./delete.js";
import { registerMockRefreshCommand } from "./refresh.js";

export function registerMockCommands(program: Command) {
  const mock = program.command("mock").description("Mock server management");
  registerMockCreateCommand(mock);
  registerMockListCommand(mock);
  registerMockShowCommand(mock);
  registerMockUrlCommand(mock);
  registerMockRefreshCommand(mock);
  registerMockDeleteCommand(mock);
}
