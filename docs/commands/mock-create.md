# `spec0 mock create`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Create (or fetch existing) mock server for an API; print URL and one-time key.

## Usage

```bash
spec0 mock create [options]
```

## Flags

| flag | description | default |
| --- | --- | --- |
| `--api <name>` | API name (required unless --api-id is set) |  |
| `--api-id <uuid>` | API id |  |
| `--org <uuid>` | Org id override |  |
| `--output <format>` | Output format: text, json, or yaml (default: text) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
