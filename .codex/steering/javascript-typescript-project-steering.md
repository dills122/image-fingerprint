# JavaScript And TypeScript Project Bindings

This file binds the reusable AI Central JavaScript/TypeScript steering to `image-fingerprint`.

## Scope

- Runtime source: `src/**/*.ts`
- Tests: `__tests__/**/*.ts`
- Tooling: root TypeScript, Vitest, ESLint, and package configuration
- Supported runtime: Node.js 22.14 or newer, verified in CI on Node.js 22 and 24
- Package manager: pnpm with the committed `pnpm-lock.yaml`
- Module system: preserve CommonJS compatibility at the root and Node.js entrypoints; publish
  browser-safe ESM only through the explicit core/browser boundaries approved in
  `docs/architecture/0002-cross-runtime-package-boundaries.md`

## Verification Commands

- Formatting: no standalone formatter is currently configured; avoid formatting-only churn
- Lint: `pnpm lint`
- Typecheck/build: `pnpm build`
- Tests: `pnpm test`
- Dependency audit: `pnpm audit --prod` in CI and a full `pnpm audit` before a release

Repository-owned guidance in `AGENTS.md` and the other files in this directory takes precedence over
the generic linked steering.
