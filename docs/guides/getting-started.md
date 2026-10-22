# Getting started

From zero to a published API in one terminal session.

## Prerequisites

- Node 22+
- An OpenAPI spec (YAML or JSON) — any example works; a trivial `openapi.yaml` in this guide.

## Install

```bash
npm install -g @spec0/cli
spec0 --version
```

## Authenticate

```bash
spec0 auth login
```

Opens a browser, prompts for the org, writes `~/.config/spec0/config.json`. Alternatively, skip this step and export `SPEC0_TOKEN` + `SPEC0_ORG_ID`.

Verify:

```bash
spec0 doctor
```

The output shows which source each value came from (env var, config file, or default).

## Initialise

```bash
cd path/to/repo-with-openapi/
spec0 init
```

Detects the spec, writes `.spec0.yaml`:

```yaml
specFile: openapi.yaml
```

## Lint

```bash
spec0 lint openapi.yaml
spec0 lint openapi.yaml --min-score 80      # gate the pipeline
spec0 lint openapi.yaml --format github     # GitHub Actions annotations
```

## Push (team-scoped, private)

```bash
spec0 push openapi.yaml --team platform
```

## Publish (public registry)

```bash
spec0 publish openapi.yaml --semver
```

`--semver` asks the backend to compute the next semver tag based on the diff (PATCH / NON_BREAKING / BREAKING). Your `openapi.yaml` is not modified.

## Verify

```bash
spec0 api list
spec0 api show my-api
spec0 log my-api
```

## Next

- [GitHub Actions CI](ci-github-actions.md) — automate the publish.
- [Mock server lifecycle](mock-server.md) — spin up a mock against the published spec.
