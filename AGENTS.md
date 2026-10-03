# Agent notes — Spec0 CLI

This repository is the **Node.js** CLI (`@spec0/cli`).

## Environment

- **Node:** `>=22` (see `package.json` `engines`).
- **Install deps:** `npm ci` (CI) or `npm install` (local).

## Use the CLI locally before pushing (global `spec0`)

To exercise the same global **`spec0`** command users get, from the repo root after dependencies are installed:

```bash
npm run build
npm link
```

Then `spec0` on your PATH runs this checkout’s `dist/index.js`. **Rebuild after every change** to `src/`: `npm run build`.

To remove the global link: run **`npm unlink`** from the repo root (undoes `npm link`), or `npm unlink -g @spec0/cli` / `npm uninstall -g @spec0/cli`.

**Alternative:** `npm install -g .` after each build (heavier than `npm link`).

## Verify changes

```bash
npm run build
node dist/index.js --help
node dist/index.js version
node dist/index.js version --json
```

Or `npm run cli -- <args>` (runs `node dist/index.js`).

**Tests:** `npm test` runs `pretest` (which runs `npm run build`) then Jest with `NODE_OPTIONS=--experimental-vm-modules`. A global `spec0` from `npm link` matches the working tree only **after** the latest `npm run build`.

## Multi-branch / multi-worktree

- Prefer **`node /absolute/path/to/checkout/dist/index.js`** so each branch or git worktree uses its own build.
- Optionally set **`SPEC0_CLI_GIT_REF`** (e.g. `$(git rev-parse --abbrev-ref HEAD)`) when comparing `spec0 version` output across checkouts.
- **`npm link`** only maps one checkout to the global `spec0` name; it is a poor fit for comparing two branches.

## Platform URLs

- **`SPEC0_APP_URL`** — Web app: **browser auth** (`spec0 auth login` → `/cli-auth`) and **register output links** to the dashboard (`specUrl`). Not used for REST calls.
- **`SPEC0_API_URL`** — Spring backend: **every** programmatic HTTP call (register, pull, mocks, lint, search, …). Stored as `org.apiUrl` on login.

Defaults in `src/lib/platform-defaults.ts`. **`SPEC0_API_URL` in the environment overrides** stored `apiUrl` for all commands (see `src/lib/auth-context.ts`). Re-login to persist a new API base in `~/.spec0/config.json`.

Legacy `PLATFORM_*` variants are still accepted for backwards compatibility; they will be removed in the next major.

## API clients

Implementation lives under `src/` (Commander commands, `src/lib/*`). Follow existing patterns when adding HTTP calls or config.

## Refreshing the vendored OpenAPI spec

The CLI's own OpenAPI contract lives at `openapi-spec/cli-api-spec.yaml` and is published to the platform as `spec0/cli-api`. To refresh it after the backend surface changes:

```bash
npm run sync:spec
```

That runs `spec0 pull spec0/cli-api -o openapi-spec/cli-api-spec.yaml` and regenerates `src/types.ts`. Commit the updated YAML + types alongside the feature that consumes them.

`sync:spec` calls into `dist/index.js`, so run `npm run build` first on fresh clones. Auth via `SPEC0_TOKEN` + `SPEC0_ORG_ID` env vars, or `spec0 auth login` for interactive use.

## Cutting a release

Releases are tag-triggered. The workflow at `.github/workflows/release.yml` lints, builds, tests, then publishes to npm via Trusted Publishing (no `NPM_TOKEN`) and creates a GitHub Release. The tag must match `package.json` `version` exactly — otherwise the workflow fails.

From a clean `main` that is green on CI:

```bash
# 1. Bump package.json + package-lock.json AND create the tag in one step.
#    Use -m so the commit message is conventional-commits compliant (commitlint).
npm version patch -m "chore(release): v%s"   # or: minor / major / X.Y.Z

# 2. Push the bump commit and the new tag together.
git push origin main --follow-tags
```

`npm version` writes the new version into both files, makes a commit `chore(release): vX.Y.Z`, and creates tag `vX.Y.Z`. The tag push triggers the workflow.

**Watch the run:** `gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`

**Verify on npm:** `npm view @spec0/cli version` should print the new version.

If the publish step fails, do **not** retry by reusing the same tag. Fix the issue on `main`, then bump again (`npm version patch -m ...`) — npm forbids re-publishing the same `version`, so a new one is mandatory.

See [RELEASE.md](./RELEASE.md) for the full policy (versioning rules, trusted-publisher config, yanking).
