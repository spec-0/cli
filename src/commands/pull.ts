/**
 * spec0 pull <org>/<name> — download spec from registry.
 *
 * Migrated to PublicRegistryService:
 *   - latest version → /api/v1/public/registry/{org}/{api}
 *   - specific tag   → /api/v1/public/registry/{org}/{api}/versions/{tag}
 *
 * Fixes the legacy CLI bug where the unauthenticated `/registry/...` path
 * sometimes returned an HTML error page; the V1 surface returns YAML body
 * directly.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "fs";
import { PublicRegistryService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../lib/api-client.js";
import { requireOrgContext } from "../lib/auth-context.js";
import { resolveRef } from "../lib/ref-resolver.js";
import { ExitCode, exit } from "../lib/exit-codes.js";
import { failApi } from "../lib/errors.js";
import { setHttpTrace } from "../lib/http-trace.js";
import { resolveOutputContext } from "../lib/output/index.js";

export function registerPullCommand(program: Command) {
  program
    .command("pull <ref>")
    .description(
      "Download spec from registry (e.g. acme/order-service or acme/order-service@v1.2.0)",
    )
    .option("-o, --output <file>", "Write to file instead of stdout")
    .option("--public", "Reserved for public registry (same endpoint when API is public)")
    .option("--org <uuid>", "Auth org id (defaults to logged-in org)")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(
      async (
        ref: string,
        opts: { output?: string; public?: boolean; org?: string; verbose?: boolean },
      ) => {
        const outCtx = resolveOutputContext(opts);
        setHttpTrace(!!opts.verbose);

        const parsed = resolveRefForPull(ref);
        let ctx;
        try {
          ctx = requireOrgContext(opts.org);
        } catch (e) {
          exit(ExitCode.AUTH_MISSING, (e as Error).message);
        }

        configureSdkAuth(ctx);

        try {
          const yaml = parsed.tag
            ? await PublicRegistryService.getPublicSpecByTag({
                orgSlug: parsed.org,
                apiName: parsed.api,
                tag: parsed.tag,
              })
            : await PublicRegistryService.getLatestPublicSpec({
                orgSlug: parsed.org,
                apiName: parsed.api,
              });
          if (opts.output) {
            writeFileSync(opts.output, yaml, "utf-8");
            console.log(chalk.green(`Wrote ${opts.output}`));
          } else {
            process.stdout.write(yaml);
          }
        } catch (err) {
          failApi(outCtx, err, {
            action: "pull",
            org: ctx.orgName ?? ctx.orgId,
            apiUrl: ctx.apiUrl,
          });
        }
      },
    );
}

/** Pull only accepts <org>/<api>[@<tag>]; UUIDs and bare names aren't useful. */
function resolveRefForPull(ref: string): { org: string; api: string; tag?: string } {
  let parsed;
  try {
    parsed = resolveRef(ref);
  } catch (e) {
    exit(ExitCode.USAGE, (e as Error).message);
  }
  if (parsed.kind !== "name" || !parsed.org) {
    exit(
      ExitCode.USAGE,
      `Pull requires '<org>/<api>[@<tag>]'. Got '${ref}'. UUIDs aren't supported by the registry endpoint.`,
    );
  }
  return { org: parsed.org, api: parsed.api, tag: parsed.tag };
}
