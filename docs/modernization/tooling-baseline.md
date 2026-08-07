# Tooling Baseline

Status: implemented baseline
Updated: 2026-08-07

## Objective

Establish reproducible, supported local and CI tooling before implementing a new fingerprint
algorithm. This slice may improve types and package verification, but must not change image decoding,
BMVB output, public callback behavior, or npm release triggers.

## Baseline Decisions

| Concern | Baseline | Reason |
| --- | --- | --- |
| Runtime | Node >=22.14; CI on Node 22 and 24 | Both are supported LTS lines; Node 20 is EOL |
| Development runtime | Node 24 | Current LTS baseline |
| Package manager | pnpm 11.20.0 | Reproducible local/CI version and compatible with the runtime floor |
| Compiler | TypeScript 5.9 | Stable existing major; avoid coupling this slice to the newly released TypeScript 7 migration |
| Module output | CommonJS with modern Node resolution | Preserve the explicitly restored package contract while handling ESM dependencies correctly |
| Lint | ESLint flat config plus typescript-eslint | Supported configuration model for current ESLint |
| Tests | Vitest 4; offline suite by default | Current stable test runner without live-network flakiness |
| CI | Node 22/24 matrix, explicit lint/types/tests, package integrity, dependency review, CodeQL, scheduled network smoke | Verify source, supply-chain changes, static security, and the artifact consumers actually load |
| Publishing | Existing behavior preserved for now | Trigger/auth changes require explicit npm release-policy approval |

The initial offline coverage baseline is 64.67% statements, 60.18% branches, 70% functions, and
64.53% lines. The first regression floors are deliberately lower—60%, 55%, 65%, and 60%
respectively—until the legacy network split and decoder cases are expanded.

## Commands

~~~sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:package
pnpm check
~~~

Live remote-input tests are opt-in:

~~~sh
pnpm test:network
~~~

CI also runs the live remote-image suite weekly and on manual dispatch. Keeping it out of pull
request verification prevents third-party availability from making normal changes flaky while still
detecting decoder or fixture drift.

## Package Verification

The package smoke test must load the built CommonJS entrypoint and hash a local fixture to its
existing golden value. This specifically catches compiler/package-boundary problems that Vitest's
source transformation can hide. CI also inspects `npm pack --dry-run` output so unexpected files or
missing package artifacts fail independently from the source test matrix.

## Dependency And Security Automation

- Dependency review rejects pull requests that introduce high or critical known vulnerabilities.
- Package verification audits production dependencies and fails on high or critical advisories.
- CodeQL scans JavaScript, TypeScript, and GitHub Actions workflows on `main`, pull requests, and a
  weekly schedule using the `security-extended` query suite.
- Dependabot checks pnpm and GitHub Actions weekly. Minor and patch npm updates are grouped by
  production/development scope, security fixes are grouped separately, and major npm updates remain
  isolated for deliberate review.
- Dependabot limits each ecosystem to five open version-update pull requests so maintenance does not
  crowd out feature work.

## Deferred Work

- TypeScript 7 evaluation after typescript-eslint and the package ecosystem are deliberately
  validated together.
- Decoder dependency changes, because different decoded pixels can change stored hashes.
- ESM or dual-package output, because a prior ESM-only release was reverted.
- Strict coverage thresholds until the offline/network test split is complete and a baseline is
  recorded.
- npm trusted publishing and tag/release automation. npm recommends OIDC trusted publishing, but it
  requires configuration in npm and an explicit decision about version ownership and release
  triggers.

## Official References

- [Node release status](https://nodejs.org/en/about/previous-releases)
- [TypeScript Node module modes](https://www.typescriptlang.org/docs/handbook/modules/reference)
- [ESLint flat-config migration](https://eslint.org/docs/latest/use/configure/migration-guide)
- [typescript-eslint flat-config quickstart](https://typescript-eslint.io/getting-started/)
- [Vitest 4 migration requirements](https://vitest.dev/guide/migration)
- [pnpm Action packageManager behavior](https://github.com/pnpm/action-setup)
- [setup-node matrix and pnpm caching](https://github.com/actions/setup-node/blob/main/README.md)
- [GitHub Actions least-privilege guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Dependabot configuration options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [Dependency review configuration](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action)
- [CodeQL workflow configuration](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
