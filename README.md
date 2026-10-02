# @spec0/cli

The scriptable control plane for the [Spec0](https://spec0.io) API platform — designed for humans at the terminal, CI pipelines, **and AI agents**.

```bash
npm install -g @spec0/cli
spec0 --version
```

Requires **Node.js 20+**.

---

## What is Spec0?

Spec0 is a platform for managing the full lifecycle of an API contract:

- **Registry** — a searchable catalogue of every API in your organisation, versioned, team-owned, and permission-scoped.
- **Publish & pull** — push an OpenAPI spec; pull it back anywhere from CI, a browser, or another service.
- **Hosted mocks** — every published spec gets a mock server that serves realistic responses for the operations in the spec.
- **Quality gates** — Spectral-based linting with org-wide rulesets, semver-aware diffing (via oasdiff), breaking-change detection.
- **Discoverable contracts** — MCP server for AI tools, changelogs, subscriptions, and a dashboard web UI.

The CLI is the **scriptable bridge** between that platform and the systems that consume it. Anything you can do in the web UI for API + mock management, you can do from a shell.

---

## Who this is for

Three first-class audiences, one command surface:

### Humans

At the terminal or in a dev loop.

```bash
spec0 lint openapi.yaml --min-score 80
spec0 publish openapi.yaml --semver
spec0 mock show my-api
```

Colorised output, sensible defaults, interactive `auth login`.

### CI / CD pipelines

Non-interactive, deterministic, stable exit codes.

```bash
export SPEC0_TOKEN=${{ secrets.SPEC0_TOKEN }}
export SPEC0_ORG_ID=${{ secrets.SPEC0_ORG_ID }}
spec0 sync-status my-api --output=json | jq -e '.needsPublish' || exit 0
spec0 publish openapi.yaml --semver
```

See [`docs/guides/ci-github-actions.md`](docs/guides/ci-github-actions.md).

### AI agents

The CLI is **self-describing**: every command emits machine-readable output (`--output=json`), and `spec0 commands --output=json` returns a full capability manifest — every command, every flag, every exit code — so an agent can discover and compose operations without hardcoding.

```bash
spec0 commands --output=json | jq '.commands[].name'
```

See [`docs/guides/ai-agents.md`](docs/guides/ai-agents.md) for the full agent playbook, including:

- How to discover capabilities at runtime.
- Decision trees for common tasks ("user wants to publish a spec → ...").
- Structured error-handling and exit-code reactions.
- MCP integration for semantic search over the org's APIs.

---

## 60-second quickstart

```bash
# 1. authenticate
spec0 auth login

# 2. from a repo containing an OpenAPI file
spec0 init                               # writes .spec0.yaml
spec0 lint openapi.yaml --min-score 80   # optional quality gate
spec0 publish openapi.yaml --semver      # public registry, auto-bumped

# 3. spin up a mock server
spec0 mock create --api my-api
spec0 mock show my-api
```

Not sure it's configured right?

```bash
spec0 doctor
```

Prints which source each setting resolved from (env var, config, or default).

---

## Commands

Every command supports `--output=text|json|yaml`. Progress / logs go to stderr, structured results go to stdout — safe to pipe.

### Auth & diagnostics

| Command             | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `spec0 auth login`  | Browser-based login; stores API key locally.                            |
| `spec0 auth logout` | Clear the locally stored token.                                         |
| `spec0 auth status` | Print the active org + key metadata.                                    |
| `spec0 whoami`      | One-line org + user summary.                                            |
| `spec0 doctor`      | Print which source each setting resolved from (env / config / default). |

### Spec lifecycle

| Command              | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `spec0 init`         | Detect `openapi.yaml` in cwd, write `.spec0.yaml`.                      |
| `spec0 push`         | Upload spec to the team-scoped workspace (private).                     |
| `spec0 publish`      | Publish to the public registry; `--semver` auto-bumps based on oasdiff. |
| `spec0 lint`         | Spectral lint; `--org-ruleset`, `--save-ruleset <file>`, `--min-score`. |
| `spec0 pull <ref>`   | Download a published spec (`acme/orders@v1.2.0`).                       |
| `spec0 diff <a> <b>` | Diff specs; both sides can be file paths or registry refs.              |
| `spec0 log <ref>`    | Version history for a published API.                                    |
| `spec0 search`       | Semantic search across the org's APIs.                                  |

### API management

| Command                     | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `spec0 api list`            | Catalogue view with `--team / --status / --search` filters.        |
| `spec0 api show <ref>`      | Single-API summary (counts, team, status).                         |
| `spec0 api changelog <ref>` | Diff between published versions; `--from / --to`, markdown output. |

### Mock servers

| Command                 | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `spec0 mock create`     | Provision (or fetch) the default mock; prints one-time key. |
| `spec0 mock list`       | Table of every mock in the org.                             |
| `spec0 mock show <api>` | Structured view (URL + metadata) for one mock.              |
| `spec0 mock url <api>`  | Pipe-friendly single-line URL (for `$(…)` substitution).    |

### CI helpers

| Command                    | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `spec0 sync-status <ref>`  | Has the spec changed since last publish? Auto-detects git SHA. |
| `spec0 ci generate github` | Emit a ready-to-commit `.github/workflows/spec0-publish.yml`.  |
| `spec0 status`             | Org overview: API count, mocks, teams, plan.                   |

### Agent & introspection

| Command                    | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| `spec0 commands`           | List every command with its flags, args, and exit codes (JSON-friendly). |
| `spec0 commands <pattern>` | Filter the manifest by substring.                                        |
| `spec0 mcp url`            | Print the MCP (Streamable HTTP) server config for Cursor / Claude.       |
| `spec0 mcp install`        | Install the MCP server into Cursor and/or Claude (`--client`).           |

### Other

- `spec0 version` — CLI + Node version.

---

## Authentication

Two paths:

1. **Interactive**: `spec0 auth login` writes `~/.config/spec0/config.json`.
2. **Non-interactive**: export `SPEC0_TOKEN` and `SPEC0_ORG_ID`.

| Variable        | Purpose                                                                                                                                                           | Default                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `SPEC0_TOKEN`   | Bearer token sent on every request.                                                                                                                               | _required_ for non-auth cmds |
| `SPEC0_ORG_ID`  | UUID of the org the CLI acts against.                                                                                                                             | _required_                   |
| `SPEC0_API_URL` | Platform backend base URL.                                                                                                                                        | `https://api.spec0.io`       |
| `SPEC0_APP_URL` | Platform web app (used for auth callback + dashboard links).                                                                                                      | `https://spec0.io`           |
| `SPEC0_MCP_URL` | MCP server endpoint (single Streamable HTTP URL) emitted by `spec0 mcp url` / `mcp install`.                                                                      | `https://api.spec0.io/mcp`   |
| `SPEC0_MODE`    | Set to `agent` to flip every default for machine callers: JSON output, no colour, no spinners, no update banner. See the [agent guide](docs/guides/ai-agents.md). | _unset_ (human mode)         |

`PLATFORM_*` variants are accepted for backwards compatibility; they'll be removed in the next major. Use `spec0 doctor` to see which source each value is resolving from.

---

## Exit codes

Stable forever — CI pipelines and agents depend on them.

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| 0    | success                                             |
| 1    | generic / unclassified failure                      |
| 2    | usage error (bad flags, missing args)               |
| 3    | not authenticated (no token / token expired)        |
| 4    | permission denied (403)                             |
| 5    | resource not found (404)                            |
| 6    | conflict (409 — e.g. name already taken)            |
| 7    | validation failed (422 — e.g. spec below min score) |
| 8    | rate limited (429)                                  |
| 9    | upstream server error (5xx)                         |
| 10   | network error (unreachable, timeout)                |

The same table is emitted by `spec0 commands --output=json`.

---

## Reference

- [**Full command reference**](docs/commands/README.md) — auto-generated per-command pages with every flag, argument, and exit code. Regenerated from the live binary via `npm run docs`.

## Guides

- [Getting started](docs/guides/getting-started.md) — zero to published.
- [GitHub Actions CI](docs/guides/ci-github-actions.md) — publish-on-change workflow.
- [Mock server lifecycle](docs/guides/mock-server.md) — create → show → probe.
- [**AI agents**](docs/guides/ai-agents.md) — how agents discover, compose, and react to commands.

### Recipes

Task-shaped, copy-paste-friendly:

- [Gate merges on breaking changes](docs/recipes/block-on-breaking-changes.md)
- [Refresh a mock after every publish](docs/recipes/refresh-mock-after-publish.md)
- [Let an agent publish on your behalf](docs/recipes/agent-publish-flow.md)

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Typos and small fixes welcome via PR; for anything larger, open an issue first. Security reports go via [`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
