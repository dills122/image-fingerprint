# AGENTS

AI coding guidance for `image-hash`.

## Purpose

This repository publishes a small Node.js/TypeScript library for deterministic image fingerprinting.

Optimize for:

- compatibility with hashes and public APIs already used by downstream projects
- measurable image-matching behavior backed by fixtures and documented thresholds
- small, explicit changes over broad refactors
- tests and documentation when behavior, contracts, setup, or commands change

## Architecture Boundaries

Primary areas:

- `src/index.ts`: public input, loading, MIME detection, decoding, and callback orchestration
- `src/block-hash.ts`: legacy Block Mean Value hash implementation and serialized hash compatibility
- `__tests__/`: public behavior and golden hash fixtures
- `docs/modernization/`: specifications, source research, benchmark design, and migration planning

Keep pure fingerprint algorithms separate from filesystem, network, and decoder adapters. When a
change spans areas, define or update the shared typed contract before implementation.

## Contract-First Files

Treat these as interface contracts before implementation details:

- `README.md` for the published API and supported inputs
- `package.json` for package entrypoints, runtime support, and commands
- `__tests__/main.test.ts` for legacy serialized hash compatibility
- `docs/architecture/0001-versioned-image-fingerprints.md` for algorithm expansion boundaries
- `docs/modernization/image-hashing-modernization-spec.md` for modernization scope and acceptance

Do not alter existing Block Mean Value hash output, stored-hash interpretation, or callback behavior
accidentally. Intentional breaking changes require a major-version plan and migration fixtures.

## Scope Control

- Keep changes localized to the requested behavior.
- Avoid unrelated refactors and generated artifact churn.
- Call out follow-up work separately from the current change.
- Do not change public interfaces, serialized fingerprint formats, algorithm identifiers, or runtime
  support without explicit intent.
- Treat perceptual hashes as matching signals, not cryptographic or adversarial-security guarantees.

## Repository Conventions

- Follow the existing ESLint and TypeScript configuration.
- Prefer explicit algorithm/version identifiers in new fingerprint contracts.
- Add focused positive, negative, and transformation fixtures for matching behavior changes.
- Preserve source-image licensing/provenance for every benchmark fixture.
- Update docs when setup steps, commands, public contracts, thresholds, or workflows change.

## Useful Commands

- Install dependencies: `pnpm install --frozen-lockfile`
- Refresh local AI Central links: `pnpm codex:links`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Build: `pnpm build`
- Full local gate: `pnpm check`

## AI Central Context

- `.codex/steering/repository-steering.md` and
  `.codex/steering/testing-quality-gates-steering.md` are repository-owned policy.
- `.codex/steering/javascript-typescript-project-steering.md` binds reusable JavaScript/TypeScript
  guidance to this package.
- `.codex/skills/` and `.codex/steering/javascript-typescript-steering.md` are ignored local symlinks
  generated from the sibling `ai-central` checkout.
- Repository-specific instructions here take precedence over generic linked guidance.

## Branch And PR Metadata

- Use feature branches for behavior, contract, test, or documentation changes.
- Do not commit directly to `main`.
- When work is ready, provide the branch name, PR title, summary, and exact verification evidence.
