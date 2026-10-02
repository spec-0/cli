# `spec0 log`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Show published version history. api-ref: api-name (default org) or org-slug/api-name

## Usage

```bash
spec0 log <api-ref> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `api-ref` | yes |  |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--org <uuid>` | Org id override (auth) |  |
| `--org-slug <slug>` | Organisation slug/name for registry path when api-ref has no slash (default: name from spec0 auth config) |  |
| `--output <format>` | Output format: text, json, or yaml (default: text) |  |
| `--json` | Deprecated. Use --output=json instead. |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
