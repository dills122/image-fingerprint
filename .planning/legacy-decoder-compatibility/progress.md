# Progress

## Log

- 2026-08-09: Synced audit started from `main` at `a93b564`.
- 2026-08-09: Compared 60 committed fixture/configuration pairs; normalized Sharp matched 54.
- 2026-08-09: Tested a Sharp compatibility configuration; focused fixtures matched 32/32.
- 2026-08-09: Generated 720 codec/configuration comparisons; 98 JPEG hashes differed, proving
  Sharp cannot replace the historical JPEG decoder under an exact-compatibility promise.
- 2026-08-09: User selected an explicit historical compatibility mode with a shared modern pixel
  flow. Created branch `codex/legacy-decoder-compatibility`, PRD, and execution plan.
- 2026-08-09: RED confirmed seven expected failures covering BlockHash encoded-image support,
  decoder-mode selection, and invalid PDQ compatibility mode. Node 22/Corepack failed before tests;
  Node 24 direct tool entrypoints were used for valid evidence.
- 2026-08-09: GREEN added the Node-only historical decoder, BlockHash `fingerprintImage()` overload,
  and callback consolidation. Focused tests pass (35 passed, 5 network tests skipped) and TypeScript
  passes.
- 2026-08-09: Generated differential gate now matches 720/720 historical hashes across JPEG, PNG,
  WebP, two methods, and three bit sizes.
- 2026-08-09: Downloaded the actual published `image-hash@7.0.1` tarball (npm shasum
  `6d5a77d1cb7aa24c93d7d7729d6787d0023c85e9`) and reproduced 720/720 exact matches.
- 2026-08-09: Promoted the generated matrix to `scripts/image-hash-v7-differential.mjs`, with an
  optional external oracle path for published-package verification.
- 2026-08-09: `pnpm check`, `npm pack --dry-run` with a task-local npm cache, packed CJS/ESM/TS
  consumers, and Chromium/Firefox/WebKit main-thread/worker tests passed before the final
  unknown-mode hardening change; full gate rerun remains.
- 2026-08-09: Review required exact-pinning `jpeg-js@0.4.4`, `pngjs@7.0.0`,
  `@cwasm/webp@0.1.5`, and `file-type@21.3.4`; the frozen install and lockfile were refreshed.
- 2026-08-09: Final source passed `pnpm check` (259 passed, 5 opt-in network tests skipped), packed
  CJS/ESM and three TypeScript resolutions, 720/720 retained and published 7.0.1 comparisons,
  `npm pack --dry-run` (108 files, 88.8 kB), and packed Chromium 151/Firefox 153/WebKit 26.5 main
  thread plus module worker conformance.
- 2026-08-09: Staged diff validation found only Markdown hard-break trailing spaces. A combined
  cleanup patch used the wrong file context on its first attempt; the two documents were then fixed
  separately and no behavior changed.
