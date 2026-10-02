/**
 * spec0 mcp url | test | install
 *
 * Helpers for pointing MCP clients (Cursor, Claude) at the Spec0 MCP server.
 * The server is a single Streamable HTTP endpoint that authenticates with the
 * MCP OAuth flow: the protected-resource metadata points clients at Clerk, which
 * dynamically registers a client and runs the browser authorization. So we
 * register the server **without** an Authorization header — setting a static
 * header makes clients (e.g. Claude Code) skip the OAuth flow entirely, and the
 * org API key isn't a JWT the gateway would accept anyway. Anonymous connections
 * get the public docs tools; signing in via the browser unlocks org-scoped ones.
 */

import { Command } from "commander";
import chalk from "chalk";
import got from "got";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolvedPlatformMcpBaseUrl, resolvedPlatformMcpUrl } from "../lib/platform-defaults.js";
import { ExitCode, exit, exitCodeForHttpStatus } from "../lib/exit-codes.js";

/** Server key used under `mcpServers` in every client config we write. */
const SERVER_KEY = "spec0";

/**
 * Canonical client config block for the Spec0 MCP server. No Authorization
 * header: the client performs the MCP OAuth flow (browser sign-in via Clerk)
 * on first connect.
 */
function canonicalServerConfig(mcpUrl: string) {
  return {
    url: mcpUrl,
  };
}

export function registerMcpCommands(program: Command) {
  const mcp = program.command("mcp").description("MCP server URL and config");

  mcp
    .command("url")
    .description("Print MCP server config for Cursor/Claude")
    .action(async () => {
      const mcpUrl = resolvedPlatformMcpUrl();
      console.log("Your MCP server URL:");
      console.log(`  ${mcpUrl}`);
      console.log("");
      console.log("Add to your MCP client config (e.g. Cursor):");
      console.log(
        JSON.stringify({ mcpServers: { [SERVER_KEY]: canonicalServerConfig(mcpUrl) } }, null, 2),
      );
      console.log("");
      console.log(
        chalk.dim(
          "No token needed here — your MCP client opens a browser to sign in (OAuth) on first connect.",
        ),
      );
    });

  mcp
    .command("test")
    .description("Verify MCP server is responding")
    .action(async () => {
      const url = `${resolvedPlatformMcpBaseUrl()}/health`;
      try {
        const res = await got.get(url);
        console.log(chalk.green("MCP gateway OK:"), res.body);
      } catch (e) {
        const status = (e as { response?: { statusCode?: number } })?.response?.statusCode;
        console.error(chalk.red("MCP health check failed:"), (e as Error).message);
        exit(status ? exitCodeForHttpStatus(status) : ExitCode.NETWORK_ERROR);
      }
    });

  mcp
    .command("install")
    .description("Install the Spec0 MCP server into Cursor and/or Claude")
    .option("--client <client>", "Target client: cursor, claude, or all", "all")
    .action(async (opts: { client: string }) => {
      runMcpInstall(opts.client);

      console.log("");
      console.log(
        chalk.dim(
          "On first use your MCP client opens a browser to sign in (OAuth via Clerk). " +
            "Anonymous access exposes the public docs tools; signing in unlocks your org's APIs.",
        ),
      );
    });
}

/**
 * Write the Spec0 MCP server config into the requested client(s). Shared by
 * `spec0 mcp install` and `spec0 setup` so the two stay in lockstep. Validates
 * the client name (exits USAGE on an unknown one) and writes the canonical
 * header-less config. Does not print the OAuth note — callers add their own
 * surrounding output.
 */
export function runMcpInstall(clientOpt: string): void {
  const client = clientOpt.toLowerCase();
  if (!["cursor", "claude", "all"].includes(client)) {
    console.error(chalk.red(`Unknown client '${clientOpt}'. Expected: cursor, claude, or all.`));
    exit(ExitCode.USAGE);
  }

  const mcpUrl = resolvedPlatformMcpUrl();
  if (client === "cursor" || client === "all") {
    installCursor(mcpUrl);
  }
  if (client === "claude" || client === "all") {
    installClaude(mcpUrl);
  }
}

/**
 * Read-merge-write `~/.cursor/mcp.json`, setting `mcpServers.spec0` while
 * preserving any other servers already configured there. Creates the file/dir
 * when absent. Pretty-prints with a trailing newline.
 */
function installCursor(mcpUrl: string): void {
  const cursorConfigPath = join(homedir(), ".cursor", "mcp.json");

  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {};
  if (existsSync(cursorConfigPath)) {
    try {
      const raw = readFileSync(cursorConfigPath, "utf-8").trim();
      if (raw) config = JSON.parse(raw);
    } catch {
      console.error(
        chalk.red(`Could not parse existing ${cursorConfigPath}; refusing to overwrite it.`),
      );
      console.error(chalk.dim("Fix or remove the file, then re-run 'spec0 mcp install'."));
      exit(ExitCode.GENERIC);
    }
  }

  const mcpServers = { ...(config.mcpServers ?? {}) };
  mcpServers[SERVER_KEY] = canonicalServerConfig(mcpUrl);
  const merged = { ...config, mcpServers };

  mkdirSync(dirname(cursorConfigPath), { recursive: true });
  writeFileSync(cursorConfigPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");

  console.log(chalk.green("Cursor:"), `wrote ${cursorConfigPath}`);
}

/**
 * Register the server with Claude via `claude mcp add`. The flag form follows the
 * current Claude CLI: options precede the server name and the Streamable HTTP
 * transport is selected explicitly (`--transport http`). No Authorization header
 * is passed — that lets the client run the MCP OAuth flow on connect.
 *
 * If the `claude` binary isn't on PATH (or the invocation fails for any reason)
 * we don't hard-fail: we print the exact command plus the manual JSON so the user
 * can finish by hand.
 */
function installClaude(mcpUrl: string): void {
  const args = ["mcp", "add", "--transport", "http", SERVER_KEY, mcpUrl];
  const printableCommand = `claude mcp add --transport http ${SERVER_KEY} ${mcpUrl}`;

  let result: ReturnType<typeof spawnSync> | undefined;
  try {
    result = spawnSync("claude", args, { stdio: "inherit" });
  } catch {
    // Swallow — handled by the fallback below (e.g. spawn error on some platforms).
  }

  if (result && result.error === undefined && result.status === 0) {
    console.log(chalk.green("Claude:"), "registered MCP server 'spec0'.");
    return;
  }

  // Binary missing or command failed — guide the user instead of failing hard.
  console.log(chalk.yellow("Claude:"), "could not run 'claude mcp add' automatically.");
  console.log("Run this command yourself:");
  console.log(`  ${printableCommand}`);
  console.log("");
  console.log("Or add this to your Claude MCP config manually:");
  console.log(
    JSON.stringify(
      { mcpServers: { [SERVER_KEY]: { type: "http", ...canonicalServerConfig(mcpUrl) } } },
      null,
      2,
    ),
  );
}
