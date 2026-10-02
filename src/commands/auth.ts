/**
 * spec0 auth login | logout | status | token
 *
 * Single-org model: `login` replaces the stored org (see config.replaceSoleOrg),
 * so there is no multi-org `switch`. Point at another backend for testing with
 * the SPEC0_API_URL / SPEC0_APP_URL env vars.
 */

import { Command } from "commander";
import chalk from "chalk";
import { createServer } from "http";
import open from "open";
import { PublicOrgsService } from "@spec0/sdk-public-platform";
import { getDefaultOrgId, getOrgConfig, replaceSoleOrg, clearConfig } from "../lib/config.js";
import { resolveOrgContext } from "../lib/auth-context.js";
import { configureSdkAuth, errorStatusCode, extractErrorMessage } from "../lib/api-client.js";
import { resolvedPlatformAppUrl, resolvedPlatformApiUrl } from "../lib/platform-defaults.js";
import { ExitCode, exit, exitCodeForHttpStatus } from "../lib/exit-codes.js";
import {
  buildLoginUrl,
  generateLoginState,
  parseLoginCallback,
  type LoginCallbackResult,
} from "../lib/browser-login.js";

function getAppUrl(): string {
  return resolvedPlatformAppUrl();
}

function getApiUrl(): string {
  return resolvedPlatformApiUrl();
}

function printAuthStatus() {
  // Reflect the context commands will actually use: SPEC0_* env vars override the stored login
  // (resolveOrgContext applies that precedence). Reading only the stored config here misreported
  // the active target whenever the env vars were set.
  const ctx = resolveOrgContext();
  if (!ctx) {
    console.log(chalk.yellow("Not logged in. Run 'spec0 auth login'."));
    console.log(chalk.gray("For CI/CD, set SPEC0_TOKEN and SPEC0_ORG_ID environment variables."));
    return;
  }
  const fromEnv = Boolean(
    (process.env.SPEC0_TOKEN ?? process.env.PLATFORM_API_TOKEN) &&
    (process.env.SPEC0_ORG_ID ?? process.env.PLATFORM_ORG_ID),
  );
  const stored = getOrgConfig(ctx.orgId);
  console.log(chalk.green("✓ Logged in") + (fromEnv ? chalk.gray("  (via environment)") : ""));
  console.log(`  Org:     ${ctx.orgName ?? ctx.orgId}`);
  console.log(`  API URL: ${ctx.apiUrl}`);
  console.log(`  Key:     ${fromEnv ? "SPEC0_TOKEN (env)" : (stored?.keyName ?? "(unnamed)")}`);
}

export function registerAuthCommands(program: Command) {
  // Top-level whoami shorthand
  program
    .command("whoami")
    .description("Show the active org and authentication state")
    .action(printAuthStatus);

  const auth = program.command("auth").description("Authentication and org management");

  auth
    .command("login")
    .description("Log in via browser and store credentials in ~/.spec0/config.json")
    .option("--app-url <url>", "Web app origin for /cli-auth (overrides SPEC0_APP_URL)")
    .option("--api-url <url>", "Backend API base (overrides SPEC0_API_URL)")
    .action(async (opts: { appUrl?: string; apiUrl?: string }) => {
      const appUrl = opts.appUrl ?? getAppUrl();
      const state = generateLoginState();
      const port = 38473 + (Math.floor(Math.random() * 1000) % 1000);
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      const authUrl = buildLoginUrl(appUrl, state, redirectUri);

      console.log(chalk.blue("Opening browser for authentication..."));
      console.log(chalk.gray(`If the browser doesn't open, visit: ${authUrl.toString()}`));

      const result = await new Promise<LoginCallbackResult>((resolve) => {
        let resolved = false;
        const doResolve = (r: LoginCallbackResult) => {
          if (resolved) return;
          resolved = true;
          resolve(r);
        };

        const server = createServer((req, res) => {
          const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
          if (url.pathname === "/callback") {
            const callback = parseLoginCallback(url.searchParams, state);
            if (callback.kind === "success") {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(
                `<!DOCTYPE html><html><head><title>Spec0 CLI</title></head><body><p style="font-family:sans-serif;padding:2rem;">Authorization complete. You can close this window and return to the terminal.</p></body></html>`,
              );
            } else if (callback.kind === "cancelled") {
              res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
              res.end("Sign-in cancelled. You can close this window.");
            } else {
              res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(`${callback.message}\n`);
            }
            doResolve(callback);
          } else {
            res.writeHead(404);
            res.end();
          }
          server.close();
        });

        server.listen(port, "127.0.0.1", () => {
          open(authUrl.toString()).catch(() => {});
        });

        server.on("error", (err) => {
          doResolve({ kind: "error", message: err.message });
        });

        const timeout = setTimeout(() => {
          if (!resolved && server.listening) {
            server.close();
            doResolve({
              kind: "error",
              message:
                "Login timed out. Run 'spec0 auth login' again, or set SPEC0_TOKEN and SPEC0_ORG_ID for non-interactive use.",
            });
          }
        }, 120000);
        server.on("close", () => clearTimeout(timeout));
      });

      if (result.kind === "cancelled") {
        console.error(chalk.yellow("Sign-in cancelled."));
        exit(ExitCode.GENERIC);
      }
      if (result.kind === "error") {
        console.error(chalk.red(result.message));
        // Login-flow failed mid-way (browser closed, timeout, port error). Not
        // "no creds" — the user tried to authenticate and the flow couldn't
        // complete. Treat as generic failure; callers see a non-zero exit.
        exit(ExitCode.GENERIC);
      }

      const keyName = `CLI — ${new Date().toISOString().slice(0, 10)}`;
      const apiUrlForStore = opts.apiUrl?.trim()
        ? opts.apiUrl.trim().replace(/\/$/, "")
        : getApiUrl();
      // Single-org model: the org you just authenticated becomes the one and
      // only active org. Replacing (not merging) prevents a stale prior login —
      // e.g. an old localhost entry — from remaining the silent default and
      // making every later command fail against a dead host.
      replaceSoleOrg(result.orgId, {
        apiKey: result.token,
        name: result.orgName,
        apiUrl: apiUrlForStore,
        keyName,
      });

      // Verify the stored credentials actually reach the platform before
      // reporting success. The browser redirect only proves the user authorised
      // the CLI; it does not prove the token + API base are usable. One
      // lightweight authenticated call turns a later opaque "api list failed:
      // Not Found" into an explicit, actionable error at login time.
      configureSdkAuth({
        orgId: result.orgId,
        apiKey: result.token,
        apiUrl: apiUrlForStore,
        orgName: result.orgName,
      });
      try {
        await PublicOrgsService.getOrgSummary();
      } catch (err) {
        const status = errorStatusCode(err);
        const detail = extractErrorMessage(err) ?? (err as Error).message;
        console.error(
          chalk.red(
            `Logged in, but could not reach the platform at ${apiUrlForStore}` +
              (status ? ` (HTTP ${status})` : "") +
              `: ${detail}`,
          ),
        );
        console.error(
          chalk.gray(
            "Credentials were saved. Retry 'spec0 auth login', or set SPEC0_API_URL to a reachable backend.",
          ),
        );
        exit(exitCodeForHttpStatus(status));
      }

      console.log(chalk.green("Logged in successfully."));
      console.log(`  Org: ${result.orgName}`);
      console.log(`  API: ${apiUrlForStore}`);
      console.log(`  Key: ${keyName}`);
    });

  auth
    .command("logout")
    .description("Deactivate key on server and clear local config")
    .action(async () => {
      clearConfig();
      console.log(chalk.green("Logged out. Config cleared."));
    });

  auth
    .command("status")
    .description("Show the active org and authentication state")
    .action(printAuthStatus);

  auth
    .command("token")
    .description("Print token (for scripting: spec0 auth token | pbcopy)")
    .action(async () => {
      const defaultOrgId = getDefaultOrgId();
      if (!defaultOrgId) exit(ExitCode.AUTH_MISSING);
      const org = getOrgConfig(defaultOrgId);
      if (!org) exit(ExitCode.AUTH_MISSING);
      console.log(org.apiKey);
    });
}
