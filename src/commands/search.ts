/**
 * spec0 search — semantic search via RAG (proxied by platform).
 *
 * Migrated to PublicRegistryService.searchPublicApis
 * (`/api/v1/public/registry/search`).
 */

import { Command } from "commander";
import chalk from "chalk";
import { PublicRegistryService } from "@spec0/sdk-public-platform";
import { configureSdkAuth } from "../lib/api-client.js";
import { requireOrgContext } from "../lib/auth-context.js";
import { ExitCode, exit } from "../lib/exit-codes.js";
import { failApi } from "../lib/errors.js";
import { setHttpTrace } from "../lib/http-trace.js";
import { resolveOutputContext } from "../lib/output/index.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search <query>")
    .description("Semantic search for APIs in your org")
    .option("--org <uuid>", "Org id override")
    .option("--public", "Reserved — public registry search uses same backend when enabled")
    .option("--max-results <n>", "Max results", "10")
    .option("--verbose", "Print HTTP request/response traces to stderr")
    .action(
      async (
        query: string,
        opts: { org?: string; public?: boolean; maxResults?: string; verbose?: boolean },
      ) => {
        setHttpTrace(!!opts.verbose);
        const outCtx = resolveOutputContext(opts);

        let ctx;
        try {
          ctx = requireOrgContext(opts.org);
        } catch (e) {
          console.error(chalk.red((e as Error).message));
          exit(ExitCode.AUTH_MISSING);
        }
        configureSdkAuth(ctx);
        try {
          const res = await PublicRegistryService.searchPublicApis({
            requestBody: {
              query,
              maxResults: parseInt(opts.maxResults ?? "10", 10),
            },
          });

          const list = (res.results ?? []) as Array<{
            apiName?: string;
            apiId?: string;
            matchedContent?: string;
            teamName?: string;
            version?: string;
          }>;
          if (list.length === 0) {
            console.log(chalk.yellow("No results."));
            return;
          }
          console.log(chalk.blue(`Results for "${query}":\n`));
          let i = 1;
          for (const r of list) {
            const id = r.apiId != null ? String(r.apiId) : "";
            const title = r.apiName || id || "API";
            const meta = [r.version, r.teamName].filter(Boolean).join(" · ");
            const body = r.matchedContent ?? "";
            console.log(`  ${i++}. ${title}  ${meta ? `(${meta})` : ""}`);
            if (body)
              console.log(chalk.gray(`     ${body.slice(0, 200)}${body.length > 200 ? "…" : ""}`));
          }
        } catch (err) {
          failApi(outCtx, err, {
            action: "search",
            org: ctx.orgName ?? ctx.orgId,
            apiUrl: ctx.apiUrl,
          });
        }
      },
    );
}
