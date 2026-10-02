# `spec0 sync-status`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Check whether a spec needs republishing (compares git SHA to last published).

## Usage

```bash
spec0 sync-status [ref] [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `ref` | no | API reference: <org>/<name>, <name>, or UUID |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--git-sha <sha>` | Git SHA to compare against (default: HEAD of current repo) |  |
| `--api <name>` | API name (alternative to positional ref) |  |
| `--api-id <uuid>` | API id (alternative to positional ref) |  |
| `--org <uuid>` | Org id override |  |
| `--output <format>` | Output format: text, json, or yaml (default: text) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
