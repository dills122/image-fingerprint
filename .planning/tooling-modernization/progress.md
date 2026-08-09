# Tooling Modernization Progress

## 2026-08-07

- Inspected package metadata, lockfile, TypeScript, Vitest, ESLint, GitHub Actions, and recent module
  format history.
- Confirmed the repository deliberately restored CommonJS after an ESM-only release attempt.
- Verified current Node LTS status and official ESLint, typescript-eslint, TypeScript, Vitest, pnpm,
  GitHub Actions, and npm publishing guidance.
- Identified the first behavior-preserving tooling slice and isolated release automation for
  separate approval.
- Added ADR 0001 for versioned fingerprint expansion and a source-cited tooling baseline.
- Declared Node >=22.14, Node 24 for development, and pnpm 11.20.0.
- Replaced legacy Airbnb/eslintrc tooling with ESLint flat config and current typescript-eslint.
- Upgraded Vitest 3 to 4, moved live HTTP tests behind `pnpm test:network`, and added offline coverage
  floors from the measured baseline.
- Enabled strict TypeScript, modern Node16 module resolution, ES2022 output, declaration maps, and
  explicit public/internal types without changing BMVB calculations.
- Changed the ESM-only `file-type` integration to a native dynamic import so the emitted CommonJS
  package can load correctly.
- Added an artifact smoke test that requires `lib` and reproduces the existing local JPEG golden
  hash.
- Fixed the undefined CI matrix, pinned tool versions, added Node 22/24 verification, updated Actions
  to current supported majors, and required verification before the existing deploy job.
- Initial sandboxed dependency refresh lost network access after rebuilding `node_modules`; reran the
  same install with approved network access and completed successfully.
- The first npm pack dry-run hit an existing root-owned user-cache problem; reran with a task-local
  cache and verified the 11-file package contents successfully.
- `pnpm check` passed on Node 22.22.1 and Node 24.19.0: 15 offline tests passed, 5 network tests were
  skipped, coverage floors passed, compilation succeeded, and the package smoke hash matched.
- `pnpm install --frozen-lockfile`, workflow YAML parsing, documentation links, JSON/shell syntax,
  Codex symlinks, and `git diff --check` passed.

## Deferred Decision

The existing npm job still bumps and publishes on every `master` push using `NPM_TOKEN`. Migrating to
tag/manual releases with npm OIDC trusted publishing requires maintainer approval and npm-side
configuration.
