# `spec0 push`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Push an OpenAPI spec to the platform (team-scoped, private)

## Usage

```bash
spec0 push [spec-file] [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `spec-file` | no | Path to OpenAPI spec file (or use --spec-file) |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--spec-file <path>` | Path to OpenAPI spec file |  |
| `--name <name>` | API name (kebab-case). Defaults to spec filename if omitted. |  |
| `--team <team>` | Team UUID or slug. Defaults to 'Unassigned APIs' if omitted. |  |
| `--version <version>` | Version tag (e.g. 1.2.0). Defaults to info.version in spec. |  |
| `--env <environment>` | Target environment (e.g. staging, production). Advances that environment to this published version. |  |
| `--api-id <id>` | Existing API UUID to update (backward compat; prefer --name) |  |
| `--semver` | Auto-compute next semver via oasdiff diff classification |  |
| `--git-sha <sha>` | Git commit SHA (auto-detected if .git is present) |  |
| `--github-repo <repo>` | GitHub repository URL for provenance |  |
| `--github-branch <branch>` | GitHub branch for provenance |  |
| `--strict` | Fail on any Spectral lint warning |  |
| `--skip-lint` | Skip lint gate |  |
| `--dry-run` | Validate and print what would be sent, without pushing |  |
| `--verbose` | Print verbose request/response logs |  |
| `--format <fmt>` | Output format: text, json, github | `text` |
| `--org <org>` | Override default org (UUID) |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
