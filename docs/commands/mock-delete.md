# `spec0 mock delete`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Delete the mock server tied to <api> (name or UUID). Requires --yes.

## Usage

```bash
spec0 mock delete <api> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `api` | yes |  |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--yes` | Skip the confirmation prompt (required for non-interactive use) |  |
| `--org <uuid>` | Org id override |  |
| `--output <format>` | Output format: text, json, or yaml (default: text) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
