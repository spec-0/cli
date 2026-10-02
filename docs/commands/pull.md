# `spec0 pull`

> Auto-generated from the `spec0 commands --output=json` manifest. Do not edit by hand.
> Run `npm run docs` to regenerate after changing command flags.

Download spec from registry (e.g. acme/order-service or acme/order-service@v1.2.0)

## Usage

```bash
spec0 pull <ref> [options]
```

## Arguments

| name | required | description |
| --- | --- | --- |
| `ref` | yes |  |

## Flags

| flag | description | default |
| --- | --- | --- |
| `-o, --output <file>` | Write to file instead of stdout |  |
| `--public` | Reserved for public registry (same endpoint when API is public) |  |
| `--org <uuid>` | Auth org id (defaults to logged-in org) |  |
| `--verbose` | Print HTTP request/response traces to stderr |  |

## Exit codes

See the [full exit-code table](../../README.md#exit-codes).

## See also

- [All commands](README.md)
- [Agent guide](../guides/ai-agents.md)
