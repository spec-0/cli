# `spec0 api changelog`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Show changes between published versions of an API.

## Usage

```bash
spec0 api changelog <ref> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `ref` | yes |  |

## Flags

| flag | description | default |
| --- | --- | --- |
| `--from <tag>` | Earlier version tag (default: previous published) |  |
| `--to <tag>` | Later version tag (default: latest published) |  |
| `--org <uuid>` | Org id override |  |
| `--output <format>` | Output format: text, json, markdown, or yaml (default: text) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
