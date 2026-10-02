/**
 * Resolve a `spec0 diff` operand to its OpenAPI document content.
 *
 * An operand is either a local file path or a registry ref (`<org>/<api>[@<tag>]`).
 * Registry content is fetched through the SDK's `PublicRegistryService`; the
 * client returns the raw document (YAML or JSON) as text.
 *
 * Extracted from the command module so it can be unit-tested without pulling in
 * chalk (which the command's console output imports).
 */
import { existsSync, readFileSync } from "fs";
import { PublicRegistryService } from "@spec0/sdk-public-platform";
import { resolveRef } from "./ref-resolver.js";
import { configureSdkAuth } from "./api-client.js";
import type { ResolvedOrgContext } from "./auth-context.js";

export async function loadSpecContent(ref: string, ctx: ResolvedOrgContext): Promise<string> {
  const trimmed = ref.trim();
  if (existsSync(trimmed)) {
    return readFileSync(trimmed, "utf-8");
  }
  const parsed = resolveRef(trimmed);
  if (parsed.kind !== "name" || !parsed.org) {
    throw new Error(`Diff requires '<org>/<api>[@<tag>]' or a local file. Got '${trimmed}'.`);
  }

  configureSdkAuth(ctx);
  const spec = parsed.tag
    ? await PublicRegistryService.getPublicSpecByTag({
        orgSlug: parsed.org,
        apiName: parsed.api,
        tag: parsed.tag,
      })
    : await PublicRegistryService.getLatestPublicSpec({
        orgSlug: parsed.org,
        apiName: parsed.api,
      });

  if (!spec || !spec.trim()) {
    throw new Error(`The registry returned an empty spec for '${parsed.org}/${parsed.api}'.`);
  }
  return spec;
}
