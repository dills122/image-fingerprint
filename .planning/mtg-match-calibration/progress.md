# Progress

## Log

- 2026-08-09: Created branch `codex/mtg-match-calibration` from merged Task 16 main at `8a102f6`.
- 2026-08-09: Started Task 17 planning and repository audit.
- 2026-08-09: Attempted to read `docs/modernization/pdq-matching-policy.md`; file does not exist. Will locate the comparison policy in the actual source/docs instead.
- 2026-08-09: Verified Wizards and dataset rights boundaries; selected the CC BY-SA 4.0 Sol Ring
  evaluation dataset with source images kept local-only.
- 2026-08-09: Added RED/GREEN tests for threshold metrics, CSV/manifest generation, Git LFS pointer
  handling, manifest validation, and deterministic plan output.
- 2026-08-09: Downloaded the pinned 307-image corpus to a temporary clone, verified all image bytes,
  and generated a 992-pair manifest.
- 2026-08-09: `pnpm build` could not start because the shell resolved Node 16/Corepack and then a
  pnpm store-runtime mismatch attempted a network metadata fetch. Ran the exact clean, TypeScript,
  and Vite build commands directly under supported Node 24.19.0 instead; all succeeded.
- 2026-08-09: Completed the Node 24.19.0 threshold sweep and retained the 1.3 MiB raw report at
  `benchmarks/pdq/results/mtg-solring-node24-2026-08-09.json`.
- 2026-08-09: Reviewed distributions and hard cases and documented conservative usage guidance.
- 2026-08-09: Code review found corpus-sized decoded-image retention in the runner. Changed the
  pipeline to decode/hash one fixture at a time and verified the complete report stayed byte-for-byte
  identical after removing `generatedAt`.
- 2026-08-09: Final verification passed under Node 24.19.0: ESLint, strict TypeScript, 251 tests
  (5 intentionally skipped), coverage floors, clean TypeScript/Vite build, package smoke checks,
  packed CommonJS/ESM/TypeScript consumers, benchmark plan validation, and `git diff --check`.
