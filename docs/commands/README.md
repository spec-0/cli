# Command reference

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.

`@spec0/cli` exposes 38 commands. Each page describes the flags and arguments for a single command.

| Command | Description |
| --- | --- |
| [`spec0 version`](version.md) | Print CLI version, Node.js version, and optional git ref (SPEC0_CLI_GIT_REF) |
| [`spec0 whoami`](whoami.md) | Show the active org and authentication state |
| [`spec0 auth login`](auth-login.md) | Log in via browser and store credentials in ~/.spec0/config.json |
| [`spec0 auth logout`](auth-logout.md) | Deactivate key on server and clear local config |
| [`spec0 auth status`](auth-status.md) | Show the active org and authentication state |
| [`spec0 auth token`](auth-token.md) | Print token (for scripting: spec0 auth token | pbcopy) |
| [`spec0 init`](init.md) | Detect your OpenAPI spec and create a .spec0.yaml config file |
| [`spec0 push`](push.md) | Push an OpenAPI spec to the platform (team-scoped, private) |
| [`spec0 publish`](publish.md) | Publish an API spec to the public registry (org-scoped, shareable URL, no team required) |
| [`spec0 mock create`](mock-create.md) | Create (or fetch existing) mock server for an API; print URL and one-time key. |
| [`spec0 mock list`](mock-list.md) | List all mock servers in the org. |
| [`spec0 mock show`](mock-show.md) | Show details for the mock server tied to <api> (name or UUID). |
| [`spec0 mock url`](mock-url.md) | Print mock base URL for <api> (name or UUID). One line, pipe-friendly. |
| [`spec0 mock refresh`](mock-refresh.md) | Rebuild the mock for <api> (name or UUID) against its current spec. URL and key are unchanged. |
| [`spec0 mock delete`](mock-delete.md) | Delete the mock server tied to <api> (name or UUID). Requires --yes. |
| [`spec0 team create`](team-create.md) | Create a new team in the org. Requires admin:team scope. |
| [`spec0 team delete`](team-delete.md) | Delete a team. Refuses non-empty teams (delete child APIs/mocks first). |
| [`spec0 team list`](team-list.md) | List all teams in the org. |
| [`spec0 lint`](lint.md) | Lint OpenAPI spec with Spectral |
| [`spec0 pull`](pull.md) | Download spec from registry (e.g. acme/order-service or acme/order-service@v1.2.0) |
| [`spec0 search`](search.md) | Semantic search for APIs in your org |
| [`spec0 diff`](diff.md) | Diff two specs: each side is a file path or registry ref org/api[@tag] (latest if tag omitted) |
| [`spec0 log`](log.md) | Show published version history. api-ref: api-name (default org) or org-slug/api-name |
| [`spec0 status`](status.md) | Show org overview: API count, mock servers, teams, plan |
| [`spec0 mcp url`](mcp-url.md) | Print MCP server config for Cursor/Claude |
| [`spec0 mcp test`](mcp-test.md) | Verify MCP server is responding |
| [`spec0 mcp install`](mcp-install.md) | Install the Spec0 MCP server into Cursor and/or Claude |
| [`spec0 skill install`](skill-install.md) | Install the Spec0 skill into Claude Code (~/.claude/skills/spec0) |
| [`spec0 skill path`](skill-path.md) | Print where 'spec0 skill install' writes the skill |
| [`spec0 setup`](setup.md) | One command: verify auth, install the MCP server, and install the Claude skill |
| [`spec0 api list`](api-list.md) | List APIs in your organisation (catalogue view). |
| [`spec0 api show`](api-show.md) | Show metadata for a single API (no spec body). |
| [`spec0 api changelog`](api-changelog.md) | Show changes between published versions of an API. |
| [`spec0 api delete`](api-delete.md) | Delete a team-scoped API (name or UUID). Requires --yes. |
| [`spec0 doctor`](doctor.md) | Diagnose CLI configuration: where each setting is being read from. |
| [`spec0 sync-status`](sync-status.md) | Check whether a spec needs republishing (compares git SHA to last published). |
| [`spec0 ci generate`](ci-generate.md) | Generate a workflow file for <provider> that runs 'spec0 publish' on push. |
| [`spec0 commands`](commands.md) | List every command in a machine-readable manifest. Designed for AI agents and scripts. |

Regenerate with `npm run docs`. CI fails if the committed files drift (`npm run docs:check`).
