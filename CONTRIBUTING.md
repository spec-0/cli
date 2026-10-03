# Contributing

Thanks for your interest in `@spec0/cli`. This is a source-available, actively maintained CLI; the core team triages contributions on a best-effort basis.

## What we accept

- **Typo fixes, small documentation improvements, clear bug fixes** — open a PR directly.
- **New features or non-trivial refactors** — open an issue first so we can confirm it fits the [roadmap](./ROADMAP.md). PRs that skip this step may be closed without review.
- **Security issues** — see [SECURITY.md](./SECURITY.md). Do not file public issues.

## Local development

Requires Node 22 or 24.

```bash
npm install
npm run build       # generate src/types.ts then compile to dist/
npm test            # jest
npm run test:smoke  # CLI smoke checks
```

After `npm run build`, run the local CLI with `node dist/index.js <command>`.

## Pull request guidelines

- Keep PRs small and focused. One change per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`.
- Add or update tests for behaviour changes.
- Run `npm run build` and `npm test` before pushing; CI runs both.
- Update `README.md` and any relevant `docs/` page when user-facing behaviour changes.

## Architectural conventions

See [ROADMAP.md](./ROADMAP.md) for the full design principles. The short version:

- Commands under `src/commands/` are thin: parse flags, call a library, format output. No HTTP or business logic inline.
- All I/O goes through `src/lib/`. Tests inject fakes; no live network in unit tests.
- `--output=text|json|yaml` and stable exit codes are part of every command's contract.

## Releases

See [RELEASE.md](./RELEASE.md). Releases are tag-triggered: push a `vX.Y.Z` tag on `main` and the workflow publishes to npm + cuts a GitHub release.

## Code of conduct

Be respectful. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) in spirit; a formal `CODE_OF_CONDUCT.md` will land if and when the contributor base grows.
