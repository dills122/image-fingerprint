# PDQ Adapter Tolerance Progress

## Log

- 2026-08-09: Fetched merged `main`, fast-forwarded through PRs #8-#10, and created
  `codex/pdq-adapter-tolerance` at `5077158`.
- 2026-08-09: Created the Task 15 plan and recorded the initial acceptance gates and risks.
- 2026-08-09: Audited the pinned Meta C++ tree. Rejected bundled CImg as a normative encoded decoder
  because upstream treats it as replaceable system I/O. Froze Sharp-normalized pixels feeding the
  raw C++ oracle as the reference pipeline so decoder and hash-core variance remain distinguishable.
- 2026-08-09: Added a red-first CLI contract test, then implemented corpus validation and stable
  plan output. The focused run now passes with 202 tests passed and 5 skipped under Node 24.19.0.
- 2026-08-09: Generated eight CC0 synthetic fixtures covering PNG, JPEG, WebP, sRGB, Display P3,
  grayscale, alpha, opaque, lossy/lossless, and EXIF orientation behavior.
- 2026-08-09: Implemented repeated Node/Sharp, Chromium, Firefox, and WebKit collection, exact
  Node-to-C++ checks, Hamming distances, nearest-rank p50/p95/maximum groups, and categorized
  exception output.
- 2026-08-09: Captured macOS arm64 evidence. Node and Chromium max distance 0; WebKit max 2;
  Firefox max 12 only for Display P3. Isolated it to ICC/color management and bounded that exact
  engine/fixture exception without weakening the initial distance-10 policy.
- 2026-08-09: Node 22.22.1 and 24.19.0 full gates, package-content verification, fixture
  reproducibility, all-engine differential collection, and production dependency audit passed.
- 2026-08-09: Five-axis review found no remaining correctness, security, regression, maintainability,
  or documentation blockers. Refactored oracle collection during review so memory is bounded to one
  decoded image/repetition instead of the whole corpus batch, then refreshed evidence and gates.
