# Tooling Modernization Findings

Updated: 2026-08-07

## Repository Findings

- `package.json` has no `engines` or `packageManager` contract.
- The lockfile is pnpm lockfile format 9; the installed modern pnpm is 11.20.0.
- `pnpm.overrides` in `package.json` duplicates the workspace override and pnpm 11 warns that the
  package field is no longer read.
- Node 16 cannot run the current dependency graph; `file-type@21` requires Node 20 or newer.
- The CI test job references `matrix.node-version` but defines no matrix.
- CI installs `pnpm: latest`, making builds non-reproducible.
- CI tests and lints PRs but does not build the publishable artifact in that job.
- ESLint 9 defaults to flat config while the repository only has `.eslintrc.js`.
- The Airbnb TypeScript config is coupled to older typescript-eslint peer versions.
- TypeScript emits ES2015/CommonJS using legacy `moduleResolution: node`.
- `file-type@21` is ESM-only, so a static import emitted as CommonJS is a package-runtime risk.
- Tests use local golden hashes but also mix in live BBC network requests.
- The publish job automatically bumps, publishes, and pushes on every `master` push using a
  long-lived npm token.

## Official Guidance

- Node recommends production use of Active or Maintenance LTS versions. In August 2026, Node 22 and
  24 are LTS; Node 20 is EOL.
- TypeScript documents `node16`/`nodenext` resolution for modern Node and describes legacy `node` as
  the pre-Node-10 resolver.
- ESLint has used flat config as the default since version 9.
- typescript-eslint's official quickstart uses `eslint.config.mjs`, `@eslint/js`, and the
  `typescript-eslint` package.
- Vitest 5 requires Node 22.12 or newer; the existing tests do not use removed advanced APIs.
- pnpm/action-setup can consume the exact package manager version from `package.json`.
- GitHub recommends read-only default `GITHUB_TOKEN` permissions.
- npm recommends OIDC trusted publishing over long-lived tokens, but configuring it requires an npm
  account/repository workflow decision outside local code changes.

## Sources

- https://nodejs.org/en/about/previous-releases
- https://www.typescriptlang.org/docs/handbook/modules/reference
- https://eslint.org/docs/latest/use/configure/migration-guide
- https://typescript-eslint.io/getting-started/
- https://main.vitest.dev/guide/migration.html
- https://github.com/pnpm/action-setup
- https://github.com/actions/setup-node/blob/main/README.md
- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.npmjs.com/trusted-publishers/
