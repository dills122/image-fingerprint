#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <changed-paths-file|--all>\n' "$0" >&2
  exit 2
fi

quality=false
dependencies=false
package=false
oracle=false
browser=false
site=false

enable_all() {
  quality=true
  dependencies=true
  package=true
  oracle=true
  browser=true
  site=true
}

if [ "$1" = "--all" ]; then
  enable_all
else
  [ -f "$1" ] || {
    printf 'Changed-paths file does not exist: %s\n' "$1" >&2
    exit 2
  }

  while IFS= read -r changed_path || [ -n "$changed_path" ]; do
    case "$changed_path" in
      .github/workflows/ci.yml|.github/workflows/codeql.yml|.github/REQUIRED_CHECKS.md|.github/scripts/classify-ci-paths.sh)
        enable_all
        ;;
    esac

    case "$changed_path" in
      src/*|__tests__/*|benchmarks/*|scripts/*|tools/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|.node-version|eslint.config.mjs|tsconfig.json|vite.lib.config.mts|vitest.config.mts)
        quality=true
        ;;
    esac

    case "$changed_path" in
      package.json|pnpm-lock.yaml|pnpm-workspace.yaml)
        dependencies=true
        ;;
    esac

    case "$changed_path" in
      src/*|example/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|.node-version|tsconfig.json|vite.lib.config.mts|scripts/clean.cjs|scripts/package-smoke.cjs|scripts/browser-package-smoke.mjs|scripts/packed-consumer-utils.mjs|scripts/packed-package-smoke.mjs|scripts/verify-pack.cjs)
        package=true
        ;;
    esac

    case "$changed_path" in
      tools/pdq-oracle/*|scripts/build-pdq-oracle.sh|scripts/pdq-oracle-smoke.mjs|scripts/generate-pdq-fixtures.mjs|scripts/generate-pdq-stage-fixtures.mjs|__tests__/fixtures/pdq/raw-vectors.json|__tests__/fixtures/pdq/stage-vectors.json)
        oracle=true
        ;;
    esac

    case "$changed_path" in
      src/index.ts|src/block-hash.ts|src/adapters/*|src/browser.ts|src/browser/*|src/core/*|example/Example.png|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|.node-version|tsconfig.json|vite.lib.config.mts|scripts/clean.cjs|scripts/browser-engine-smoke.mjs|scripts/browser-package-smoke.mjs|scripts/browser-smoke.html|scripts/browser-smoke-worker.mjs|scripts/packed-consumer-utils.mjs)
        browser=true
        ;;
    esac

    case "$changed_path" in
      site/*|.github/workflows/pages.yml|pnpm-lock.yaml|pnpm-workspace.yaml|.node-version)
        site=true
        ;;
    esac
  done < "$1"
fi

printf '%s\n' \
  "quality=$quality" \
  "dependencies=$dependencies" \
  "package=$package" \
  "oracle=$oracle" \
  "browser=$browser" \
  "site=$site"
