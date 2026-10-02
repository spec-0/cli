# `spec0 team delete`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Delete a team. Refuses non-empty teams (delete child APIs/mocks first).

## Usage

```bash
spec0 team delete <teamId> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `teamId` | yes |  |

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
