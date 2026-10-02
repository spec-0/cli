# `spec0 ci generate`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Generate a workflow file for <provider> that runs 'spec0 publish' on push.

## Usage

```bash
spec0 ci generate <provider> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `provider` | yes | CI provider (currently supported: github) |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--spec-file <path>` | Path to OpenAPI spec file | `openapi.yaml` |
| `--api-name <name>` | API name to embed in the workflow (default: spec filename) |  |
| `--branch <branch>` | Git branch that triggers the workflow | `main` |
| `--write` | Write the workflow to its suggested path (default: print to stdout) |  |
| `--org <uuid>` | Org id override |  |
| `--output <format>` | Output format for metadata: text, json, yaml (default: text) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
