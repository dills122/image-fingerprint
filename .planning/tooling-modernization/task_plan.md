# Tooling Modernization Plan

Status: first implementation slice complete
Updated: 2026-08-07

## Goal

Create a reproducible, supported Node.js/TypeScript development base before adding another image
fingerprint algorithm, without changing current hash output or silently changing npm release policy.

## Phases

- [x] Audit runtime, package manager, compiler, lint, test, CI, and publishing configuration.
- [x] Verify current official support and migration guidance.
- [x] Record the algorithm-expansion architecture decision and tooling baseline.
- [x] Implement the behavior-preserving local/CI tooling slice.
- [x] Install from the updated lockfile and run all verification gates.
- [x] Present release-workflow modernization as a separate approval decision.

## First Slice Acceptance

- Node support is explicit and covers supported LTS lines.
- pnpm is pinned and CI consumes the same version.
- ESLint uses flat config with supported TypeScript integration.
- TypeScript uses modern Node module resolution while emitting a CommonJS-compatible package.
- CI actually tests the declared Node matrix and runs lint, test, build, and package smoke checks.
- The built package can be loaded and hash a local fixture.
- Existing BMVB golden hashes remain unchanged.

## Decisions

- Keep CommonJS compatibility because the repository explicitly reverted an ESM-only release.
- Use Node 22.14 as the minimum and Node 24 as the development baseline.
- Keep TypeScript 5.9 for this slice; TypeScript 7 is newly released and not required for the
  runtime/tooling corrections.
- Modernize verification CI now; do not change npm publish triggers or credentials without explicit
  maintainer approval.

## Risks

- `file-type@21` is ESM-only; the CommonJS build needs a preserved dynamic-import boundary.
- Enabling full TypeScript strict mode may require public API typing decisions; stage it if it
  obscures the behavior-preserving tooling change.
- Decoder upgrades can change pixels and therefore hashes; they are outside this tooling slice.
- The current release job mutates versions and publishes on every `master` push; changing it is a
  separate externally consequential workflow decision.

## Result

The first slice meets its acceptance criteria on Node 22 and Node 24. Release trigger and
authentication modernization remains a separate maintainer decision.
