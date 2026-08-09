# JavaScript And TypeScript Project Bindings

This file binds the reusable AI Central JavaScript/TypeScript steering to `image-hash`.

## Scope

- Runtime source: `src/**/*.ts`
- Tests: `__tests__/**/*.ts`
- Tooling: root TypeScript, Vitest, ESLint, and package configuration
- Supported runtime: must be declared in `package.json` and verified in CI before modernization code
  ships; the current dependency graph already requires Node.js 20 or newer
- Package manager: pnpm with the committed `pnpm-lock.yaml`
- Module system: preserve current CommonJS compatibility until a separately approved package-export
  migration defines CJS/ESM behavior

## Verification Commands

- Formatting: no standalone formatter is currently configured; avoid formatting-only churn
- Lint: `pnpm lint`
- Typecheck/build: `pnpm build`
- Tests: `pnpm test`
- Dependency audit: `pnpm audit --prod` when dependency or release work requires network access

Repository-owned guidance in `AGENTS.md` and the other files in this directory takes precedence over
the generic linked steering.
