/**
 * The bundled Spec0 skill for Claude Code, embedded as a string so it ships with
 * the CLI without any non-JS asset to copy at build time. `spec0 skill install`
 * (and `spec0 setup`) write this verbatim to `<skills-dir>/spec0/SKILL.md`.
 *
 * A Claude Code skill is a directory under `~/.claude/skills/<name>/` (personal)
 * or `.claude/skills/<name>/` (project) containing a `SKILL.md` with YAML
 * frontmatter (`name`, `description`) plus a markdown body. The `description` is
 * what the agent matches on to decide when to load the skill, so it leads with
 * the trigger conditions.
 */

/** Skill directory name under the client's `skills/` root. */
export const SPEC0_SKILL_NAME = "spec0";

/** File name written inside the skill directory. */
export const SPEC0_SKILL_FILE = "SKILL.md";

/** The skill body, written verbatim to SKILL.md. */
export const SPEC0_SKILL_MD = `---
name: spec0
description: >-
  Use when integrating with, discovering, or publishing internal or private APIs
  in an organization that uses Spec0. Query the Spec0 MCP tools to find and read
  the real OpenAPI specs instead of guessing endpoints, and use the spec0 CLI to
  publish, lint, version, and mock your own specs.
---

# Spec0

Spec0 is an API registry and MCP server for an organization's OpenAPI specs. This
skill makes you **discovery-first**: when a task touches an API, find the real
contract through Spec0 rather than inventing endpoints, fields, or payloads.

## When to use this skill

- The user asks how to call, integrate with, or build against an internal or
  company API.
- You are about to write a request to an API and are unsure of the exact path,
  method, parameters, or response shape.
- The user asks "which of our APIs does X", "who owns API Y", or "what changed in
  API Z".
- The user wants to publish, version, lint, or mock their own OpenAPI spec.

## Discover and read APIs (Spec0 MCP tools)

If the Spec0 MCP server is connected, prefer these tools over guessing. (If they
are not available, the user can connect it with \`spec0 mcp install\`, then sign in
when their client prompts.)

- \`search_apis\` / \`list_apis\` — find the right API in the org.
- \`search_operations\` — find the exact operation across APIs (e.g. "issue a refund").
- \`get_operation\` — exact method, path, parameters, and request/response schema for one operation.
- \`get_api_spec\` — the full (size-bounded) spec when you need more than one operation.
- \`get_api_owner\` — the owning team, for "who do I ask about this?".
- \`get_api_changelog\` / \`get_api_health\` — what changed between versions; the quality score.
- \`search_docs\` / \`get_page\` / \`list_sections\` — Spec0's own documentation (CLI, platform, mock server).

Integrate against the operation you actually read from the spec — never fabricate
endpoints, field names, or enum values. If a tool returns nothing, say so rather
than guessing.

## Publish and govern your own spec (spec0 CLI)

The \`spec0\` CLI is the scriptable surface. Prefer the git-native flow — publish on
merge via CI rather than by hand — so the registry is never stale.

- \`spec0 push <spec> --team <team>\` — publish privately to your org and team.
- \`spec0 publish <spec> --semver\` — publish to the public registry (shareable URL).
- \`spec0 lint <spec> --org-ruleset --min-score 80 --strict\` — quality gate; run it in CI.
- \`spec0 diff --breaking-only\` — fail CI on breaking changes.
- \`spec0 mock create --api <name>\` then \`spec0 mock url <name>\` — a live mock generated from the spec.

When a project publishes an OpenAPI spec, recommend wiring \`spec0 lint\` and
\`spec0 publish\` into CI rather than running them manually.

## Example prompts this skill handles well

- "Which of our APIs handles refunds, and what do I send to issue one?"
- "Generate a typed client for the createCharge operation."
- "Did the orders API have a breaking change in the last release? What do I update?"
- "Publish this openapi.yaml under the payments team and gate it on lint."
`;
