# Image Hashing Modernization Progress

## 2026-08-07

- Audited the current package structure, callback API, decoders, BMVB implementation, and golden
  tests.
- Integrated the sibling AI Central repository in link mode with project-owned guidance.
- Added a reproducible AI Central setup wrapper and provenance pin.
- Reviewed the planning-files, source-driven, and spec-driven workflow guidance installed by AI
  Central.
- Reviewed Meta's PDQ whitepaper as text and rendered pages.
- Inspected Meta's current PDQ README, C++ and Java core implementations, hash serialization,
  regression material, MIH notes, and `python-threatexchange` thresholds.
- Pinned source inspection to ThreatExchange commit
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.
- Drafted reference, benchmark, and modernization specification documents.
- Verified shell syntax, JSON syntax, Markdown-local links, the AI Central revision pin, and the
  absence of broken Codex symlinks.
- Ran the AI Central wrapper twice and confirmed that refresh is idempotent.
- Did not run package lint/build/tests because dependencies are not installed. The login shell is
  also on Node 16 while the repository's dependency graph requires a modern Node runtime; selecting
  and declaring the supported runtime remains an explicit specification decision.

## Current Gate

Primary-source research, contract approval, the cross-runtime foundation, and implementation Tasks
2–6 are complete. Portability hardening is authorized and in progress before public Task 7 dispatch.
Tasks 7–11 otherwise await the next maintainer authorization.

## 2026-08-07 — Tooling Prerequisite

- Added proposed ADR 0001 for versioned algorithm expansion.
- Completed the supported Node/pnpm/TypeScript/ESLint/Vitest/CI baseline before PDQ implementation.
- Preserved existing local BMVB golden hashes through strict typing and package-boundary changes.

## 2026-08-09 — Maintainer Review And Contract Research

- Reviewed the modernization specification, ADR, benchmark requirements, implementation scaffold,
  current source, tests, and package contract.
- Confirmed that the repository gate passes under explicit Node 22 and Node 24 runtimes.
- Confirmed the intended product boundary: the library hashes complete images or caller-supplied
  cropped pixels; application-specific detection and cropping remain outside this package.
- Agreed that the new fingerprint API is opt-in and separate from the legacy `imageHash()` API.
- Agreed on a TypeScript production core supporting Node.js, browsers, and Web Workers, with Meta
  C++ as the normative oracle and same-source WASM as a conformance/performance goalpost.
- Reviewed a separate ChatGPT research report. Retained its useful architectural findings but did
  not accept its citations as authoritative because at least one npm citation was malformed and
  several claims still require primary-source verification.
- Expanded the persistent plan with bounded contract-research tasks that must be resolved before
  implementation planning.
- Found pre-existing uncommitted cross-runtime foundation changes on branch
  `codex/cross-runtime-foundation`; documentation work is being kept separate from those files.

### Current Activity

Source-backed research and specification approval are complete. The dependency-ordered PDQ build
plan is awaiting maintainer review; production implementation remains behind that plan gate.

- Created a temporary filtered clone of Meta ThreatExchange for direct inspection of the pinned
  reference revision; no upstream source is being added to the repository during research.
- The first pinned checkout could not resolve GitHub while fetching filtered blobs inside the
  sandbox. Retrying the same pinned checkout with approved network access succeeded at
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.
- Verified the C++ minimum dimensions, luminance constants, float buffers, quality calculation,
  bit thresholding, 256-bit serialization, and Hamming comparison directly from the pinned source.
- Verified Meta's exact-raw and decoder-tolerance guidance, starting policy, BSD code license, and
  separate restrictions on bundled testing images.
- Verified Node `exports` compatibility behavior and the browser `ImageData`/`createImageBitmap`
  contract against current official documentation.
- Rechecked the main JavaScript alternatives. `pdq-wasm` remains the closest comparator, but its
  npm and repository versions differ and its initialization/binary/test-contract costs confirm it
  should not be the default production dependency.
- Added `docs/modernization/pdq-contract-research.md` and reconciled the modernization spec, ADRs,
  reference material, directory status, and implementation scaffold with the research.
- No PDQ production source was implemented or modified during this research phase.
- The maintainer approved white alpha compositing with deterministic integer rounding and the
  schema-versioned fingerprint record with `bitLength` and mandatory PDQ quality.
- Began dependency-ordered implementation planning using the repository planning workflow; no
  production implementation is authorized by this planning action alone.
- Re-audited the cross-runtime source and tests for concrete task/file boundaries. The
  foundation now includes the approved record fields for BlockHash; PDQ mainly needs the tagged
  pixel union, algorithm modules, dispatch, comparison/serialization helpers, and conformance data.
- Replaced the phase-only scaffold with an 18-task, dependency-ordered implementation plan. Each
  task has acceptance criteria, verification commands, dependencies, likely files, and a bounded
  scope; checkpoints separate foundation, oracle, exact core, records/comparison, packaging,
  adapters, benchmarks, and release.
- The plan originally made Tasks 1–11 the first implementation increment; fresh-main synchronization
  completed Task 1, leaving Tasks 2–11 as the proposed PDQ core increment. Encoded-image adapters
  remain behind a separate maintainer gate.
- Validated the plan structure: all 18 tasks include dependencies, verification, and bounded scope;
  seven checkpoints separate the major risk boundaries. Markdown links resolve and
  `git diff --check` passes.

### Planning Errors

- A read command requested nonexistent `vitest.config.ts` and `eslint.config.ts` after successfully
  reading the other requested files. The actual config names will be resolved with `rg --files`
  rather than retrying those paths.
- A follow-up command correctly found `vitest.config.mts` but accidentally attempted
  `vite.config.mts`; the intended Vite library config had already been read as
  `vite.lib.config.mts`. Planning now uses the resolved filenames and will not retry the missing
  path.
- The first `git fetch origin main` attempt was blocked because the sandbox could not write
  `.git/FETCH_HEAD`. The same narrowly scoped fetch was retried with approval and succeeded.
- The first fresh-main `pnpm check` invocation failed before project scripts ran: `/usr/local/bin/node`
  was Node 16.15.0 while the selected `pnpm` shim belonged to fnm's Node 22.21.1 Corepack install.
  Node 16 lacks `URL.canParse`, which that Corepack version requires. Verification must be rerun
  through an explicitly selected supported fnm runtime; this is an environment-path failure, not a
  repository test failure.
- The first explicit Node 22 rerun reached pnpm but stopped before scripts because pnpm 11.20.0
  detected an incompatible existing `node_modules` layout and would not purge it without a TTY.
  Refresh dependencies from the frozen lockfile in noninteractive CI mode before retrying the gate.
- The frozen install then completed under Node 22.21.1 with `file-type` 21.3.2. Pnpm's pre-command
  dependency-status reconciliation still required noninteractive CI mode in this shell; with
  `CI=true`, the explicit `pnpm run check` package script completed successfully. The earlier
  dependency-status stack did not establish a collision with the package script name.
- The first `npm pack --dry-run` rebuilt the package successfully but failed while opening a
  root-owned entry in the user npm cache. Do not change cache ownership for this task; rerun the
  dry-run with a disposable cache under `/tmp`.
- The first clean Task 2 fetch could not resolve `github.com` inside the restricted sandbox and left
  its disposable output directory partially initialized. A new clean directory was used for the
  approved-network retry; no failed state was reused.
- The first ShellCheck run flagged four SC1007 warnings for the compact `CDPATH= cd` form used
  during physical path resolution. The assignments were made explicit as `CDPATH=''`; no behavior
  or output path changed.

### 2026-08-09 Main Refresh

- Refreshed `origin/main` from `a7a630e` to `d4f88fa` without touching the dirty planning files.
- The only new upstream commit is the `file-type` 21.1.0 to 21.3.2 dependency update; relative to
  `codex/cross-runtime-foundation`, it changes only `pnpm-lock.yaml`.
- The cross-runtime/browser foundation is on `origin/main` as merge-equivalent commit `2686eac`.
  The local feature commit `e04939e` has the same patch but a different commit identity, so the
  histories diverge even though their source changes match.
- Fast-forwarded local `main` to `d4f88fa` with the dirty PDQ documents preserved, then moved the
  planning work to `codex/pdq-build-plan` so no implementation or documentation is committed
  directly to `main`.
- Re-audited package scripts, CI, the core contract, and the browser smoke assets from fresh main.
  The foundation provides portable raw RGBA hashing, explicit `/core`, `/node`, and `/browser`
  exports, packed ESM/CJS checks, and a browser HTML fixture, but CI does not launch a browser or
  execute workers yet.
- Fresh-main `CI=true fnm exec --using=22.21.1 -- pnpm run check` passed: lint, typecheck, 24 tests
  passed with 5 network tests skipped, coverage thresholds passed, the CJS/ESM build succeeded, and
  both packed-entry smoke scripts passed.
- The identical full gate also passed locally under Node 24.19.0 with the same 24 passed, 5 skipped,
  coverage, build, and packed-entry results.
- Fresh-main `npm pack --dry-run` passed using an isolated `/tmp` cache after rebuilding the package;
  the candidate tarball contains 31 files and no research, fixture, or planning artifacts.
- Final synchronization checks pass: `git diff --check` reports no whitespace errors, and every
  repository-relative Markdown link enumerated from the changed documentation resolves to an
  existing target.

## 2026-08-09 — Tasks 2–3 Oracle And Corpus

- The maintainer authorized Tasks 2–3 after reviewing the fresh-main synchronization.
- Work is restricted to local-only oracle tooling, deterministic synthetic raw inputs, generated
  expected hash/quality data, provenance, and verification. No Meta source, upstream image, native
  binary, build directory, or WASM asset may enter the published package.
- Test-first order is required: define failing harness/corpus contract tests before adding the build
  and generation implementation.
- The prior `/tmp/image-hash-pdq-reference.aNC92H` path still exists but is not a Git worktree, so
  it cannot establish the pinned revision or serve as the reproducible build input. Inspect its
  shape only if useful, then create a fresh commit-verified temporary checkout through the new build
  workflow rather than reusing it as trusted state.
- RED: added `__tests__/pdq-fixtures.test.ts` to freeze the offline corpus schema, required fixture
  classes, byte lengths/checksums, canonical oracle outputs, RGBA normalization, and gray/RGB
  equivalence. The focused Vitest run failed all four tests solely because
  `__tests__/fixtures/pdq/raw-vectors.json` does not exist yet, proving the new contract is active
  before generator implementation.
- GREEN (oracle build): added the decoder-free C++ wrapper, pinned/verified build script, smoke
  runner, fixture generator, provenance documents, third-party BSD notice, and package commands.
  An offline build from the verified pinned checkout succeeded with Apple clang 21.0.0 using
  `-std=c++11 -O3 -Wall -Wextra -Werror`; the binary exists only at
  `/tmp/image-hash-pdq-oracle-build-20260809/pdq-oracle`.
- GREEN (oracle protocol): the smoke command hashed the same 17×19 equal-channel pattern twice as
  gray8 and RGB8, returning the identical canonical hash
  `dbb0f9939b26ff90904d6ec0f64c6488ff40601bbb60c9929133dfb28037dfb0` and quality 100; it also
  verified rejection of a truncated 5×5 input.
- GREEN (initial corpus generation): the pinned oracle generated 16 deterministic synthetic vectors
  into `__tests__/fixtures/pdq/raw-vectors.json`, covering every Task 3 fixture class without an
  encoded image or third-party pixel source.
- The first post-generation focused test run had one false negative: byte-identical RGBA-normalized
  data compared a Node `Buffer` with a `Uint8Array`, and Vitest includes the prototype in deep
  equality. The assertion now uses `Buffer.compare`, preserving exact byte comparison without
  requiring the containers to share a prototype.
- GREEN (offline corpus contract): after the byte-container assertion fix, all four new fixture
  tests pass. The full Vitest invocation reports 28 passed and 5 pre-existing network tests skipped.
- GREEN (determinism pass 1): regenerated all 16 vectors and compared the output byte-for-byte with
  the saved baseline. Both files have SHA-256
  `73651310862597cc18bb5f41b3984d05171afa7fe5eccf1b38d1a09e2bb6cfc0`.
- GREEN (clean network build): from a new empty `/tmp` directory, the build script fetched exactly
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`, verified the detached checkout, and compiled the
  oracle successfully. This proves the documented no-`--source` path independently of the earlier
  research checkout.
- GREEN (clean build protocol): the clean-fetched binary produced the same deterministic gray/RGB
  smoke answer under Node 24, then generated all 16 vectors to a separate `/tmp` output for
  cross-build comparison.
- GREEN (cross-build corpus): the clean-build `/tmp` corpus is byte-identical to the repository
  fixture and has the same SHA-256 `73651310862597cc18bb5f41b3984d05171afa7fe5eccf1b38d1a09e2bb6cfc0`.
- GREEN (Node 22 full gate): lint, typecheck, 28 passed tests with 5 pre-existing network skips,
  coverage thresholds, CJS/ESM build, and both package smoke scripts pass under Node 22.21.1.
- GREEN (Node 24 full gate): the identical full gate passes under Node 24.19.0 with the same test,
  coverage, build, and packed-entry results.
- GREEN (package exclusion): `npm pack --dry-run --json` reports the same 31 publishable files—only
  LICENSE, README, `lib/**`, and `package.json`. Oracle tooling, Meta checkout/source, native
  binaries, fixture JSON, provenance documents, scripts, and planning files are excluded.
- Quality review verdict: request changes before marking Tasks 2–3 complete. Four required hardening
  items were identified: oracle identity handshake, bounded exact stdin, rejection of all checkout
  modifications, and strict generator argument parsing. No architecture split, dependency, or
  published-runtime issue was found.
- RED (review hardening): the updated smoke contract now requires protocol version 1, the official
  repository URL, the exact pinned commit, and a 64 MiB input ceiling. It fails against the
  pre-hardening binary because `--metadata` is not implemented, proving the provenance check is not
  cosmetic.
- GREEN (review hardening build): the wrapper now exposes the pinned identity, caps declared input
  at 64 MiB, reads only the exact declared bytes plus an overflow sentinel, validates RGB stride,
  and avoids the const cast. The build rejects tracked or untracked checkout changes. A new strict-
  warning build succeeded from the verified offline checkout.
- GREEN (review hardening behavior): the updated smoke passes the metadata, deterministic gray/RGB,
  truncated-input, and 64 MiB limit checks. The identity-verifying generator produced a fixture
  byte-identical to the approved corpus with SHA-256
  `73651310862597cc18bb5f41b3984d05171afa7fe5eccf1b38d1a09e2bb6cfc0`.
- GREEN (negative generator checks): an unknown flag is rejected before any write, and the generator
  refuses the earlier pre-metadata oracle binary instead of labeling its output as pinned. These
  failures are intentional boundary tests, not unresolved errors.
- GREEN (checkout integrity): after adding an untracked sentinel to a disposable pinned checkout,
  the build script rejected it as not clean before compilation. This confirms untracked shadow files
  cannot silently affect a provided source tree.
- GREEN (post-review Node 22 gate): shell and Node script syntax checks pass, followed by the full
  lint, typecheck, 28-test, coverage, build, and package-smoke gate under Node 22.21.1.
- GREEN (post-review Node 24 gate): the identical full repository gate passes under Node 24.19.0.
- GREEN (final fixture contract): the expanded offline suite now has 29 passed tests and 5
  pre-existing network skips; it additionally proves canonical base64 and direct gray/RGB oracle
  bytes.
- Tasks 2–3 are complete. Checkpoint B remains intentionally partial because both successful native
  builds were on the same macOS/Apple clang environment; a Linux build should supply the second-
  environment evidence before release.
- FINAL GREEN (Node 22): ShellCheck, POSIX shell syntax, both Node script syntax checks, lint,
  typecheck, 29 passed tests with 5 pre-existing network skips, coverage, build, and package smokes
  all pass after the completed quality-review fixes.
- FINAL GREEN (Node 24): the identical full repository gate passes under Node 24.19.0 with 29 tests
  passed and 5 pre-existing network skips.
- Final quality-review verdict: approve Tasks 2–3. Correctness, readability, architecture, security,
  performance, licensing, and verification findings are resolved; no production dependency or
  published runtime code was added.
- Final integrity pass: `git diff --check` passes, all relative links across 25 Markdown files
  resolve, and the untracked inventory contains only the intended fixture, tests, research document,
  scripts, and `tools/pdq-oracle` sources—not a Meta checkout, compiled binary, or build artifact.

## 2026-08-09 — Task 4 Authorization

- The maintainer authorized Task 4 and the Linux CI follow-through for Checkpoint B.
- Task 4 is additive: existing untagged tightly packed RGBA input remains the BlockHash contract;
  tagged `gray8`, `rgb8`, and `rgba8` inputs establish the PDQ boundary without changing legacy
  BlockHash serialization or callback behavior.
- The implementation will be test-first and will freeze exact byte-length, dimension, typed-array,
  minimum-size, and deterministic white-alpha-compositing behavior before adding production code.
- Adding the Linux job does not itself close Checkpoint B; the checkpoint closes only when that job
  runs successfully and provides Linux compiler/oracle/corpus evidence.
- RED: added focused pixel-contract tests and a tagged-RGBA BlockHash compatibility test. The test
  run failed because `src/core/pixels.ts` does not exist, while all 30 previously runnable tests
  passed (with the five pre-existing network skips), proving the new contract was exercised before
  implementation.
- The first GREEN run exposed a legacy error-message regression: the shared formatter produced
  `Pixel pixel data...` instead of the existing `Pixel data...`. The failure reproduced reliably in
  the existing core test and localized to the new RGBA container helper. The helper now distinguishes
  the legacy untagged label from tagged `rgba8`; the pre-existing assertion guards the exact message.
- GREEN: the additive tagged pixel types, isolated normalization/validation module, and tagged RGBA
  BlockHash path now pass the pixel/core suite (41 passed with five pre-existing network skips).
  TypeScript 5.9 strict typechecking also passes under Node 22.21.1.
- RED (container identity): a plain object with a spoofed `Symbol.toStringTag` passed the initial
  realm-safe tag check. A focused regression test now requires a real ArrayBuffer view in addition
  to the expected byte-array tag; this preserves cross-realm support without accepting tag-only
  impostors.
- GREEN (container identity): the focused suite passes with 42 tests and five pre-existing network
  skips after requiring both `ArrayBuffer.isView()` and the realm-safe typed-array tag.
- A read-only Docker daemon check was blocked by the workspace sandbox's Docker-socket permission.
  This is an environment-access failure, not oracle evidence; retry the same read-only check with
  narrowly scoped approval before deciding whether local Linux evidence is available.
- Linux Docker attempt 1: the pinned C++ oracle built successfully on Linux arm64 with Debian GNU
  `c++` 14.2.0 and the metadata/raw smoke checks passed under Bun. Bun then generated a corpus that
  differed from the Node-generated fixture at line 31. The comparison correctly stopped the run;
  Bun is not accepted as a deterministic-generator substitute. Diagnose the runtime difference and
  retain GitHub's Node 24 job as the authoritative full Linux checkpoint.
- A findings update initially failed because the patch context used different Markdown continuation
  indentation than the file. Reading the exact local lines and applying a narrower patch resolved
  the documentation-only mismatch; no source or test file was affected.
- Linux Docker attempt 2 preserved the Bun-generated corpus, but a follow-up direct-oracle command
  referenced a diagnostic byte file that had not been created and failed after generation. The
  generated JSON was retained and sufficient for diagnosis; do not repeat the missing-file command.
- Diffing the retained corpus shows identical raw/base64/checksum data and identical quality but
  several GCC-built C++ hashes differ from the Apple-clang-generated goldens. Checkpoint B therefore
  remains open for a substantive numeric reproducibility reason, not because CI wiring is missing.
- Linux numeric experiment 1: rebuilding GCC 14.2.0 with `-ffp-contract=off` did not align the corpus;
  the exact comparison still failed on the first vector. Floating-point contraction alone does not
  explain the oracle variance.
- Linux numeric experiment 2: an effective `-O0 -ffp-contract=off` GCC build still diverged on the
  first vector. Stop compiler-flag experiments here; neither optimization nor contraction alone
  restores the Apple-clang answers.
- GREEN (second environment): a disposable Debian Linux arm64 container installed Clang 19.1.7,
  fetched and built the exact pinned ThreatExchange commit, regenerated all 16 vectors, and passed
  byte-for-byte `cmp` against the repository corpus. This independently reproduces the Apple clang
  21 answers and closes the two-clean-environment oracle criterion; recurring GitHub Node 24/Linux
  evidence remains to be observed on the first CI run.
- Added the recurring `ubuntu-24.04`/Node 24 oracle-conformance job with explicit `clang++-18`. It
  builds in `$RUNNER_TEMP`, verifies metadata and raw smoke behavior, regenerates all vectors, and
  requires a byte-identical corpus without installing package dependencies or publishing artifacts.
- Updated the public README, oracle README, fixture provenance, and implementation plan for the
  additive tagged input contract and the measured Clang/GCC oracle boundary.
- Intermediate verification passes: ESLint, strict TypeScript typecheck, workflow YAML parsing, and
  `git diff --check`.
- FULL GREEN (Node 22.21.1): lint, typecheck, 42 passed tests with five pre-existing network skips,
  coverage (88.21% statements / 83% branches / 90.9% functions / 87.81% lines), CJS/ESM build, and
  package/browser smoke tests all pass.
- FULL GREEN (Node 24.19.0): the identical complete gate passes with the same tests, skips,
  coverage, build, and packed-entry smoke evidence.
- Quality review requested changes before completion: preserve legacy RGBA objects carrying an
  unrelated `format` metadata property, make the oracle job gate publishing, and cover overlong
  tagged buffers. No dependency, secret, unbounded-I/O, or package-content issue was found.
- RED (review compatibility): the new regression test proved that a legacy RGBA object with
  `format: 'canvas-rgba'` was incorrectly rejected as a tagged input. Overlong packed-buffer cases
  already failed correctly. BlockHash tag detection now reserves only `gray8`, `rgb8`, and `rgba8`;
  unrelated metadata follows the historical RGBA validation path. The oracle job now also gates the
  release job.
- The first combined review-fix patch was malformed at a file boundary and was rejected before any
  edit. Reapplying the same narrow changes with valid patch hunks succeeded; no partial source or CI
  state was created by the failed attempt.
- The first focused run after adding review coverage failed to parse `pixels.test.ts` because the
  edit left one extra `});` after the new parameterized dimension case. Line-number inspection
  localized the unmatched token; removing only that line restores the intended describe structure.
- GREEN (review fixes): the focused suite passes with 50 tests and five pre-existing network skips,
  including legacy format-metadata compatibility, reserved gray/RGB BlockHash tags, both packed-
  length directions, safe dimensions, and both minimum-dimension axes. Built declarations expose
  the approved tagged input types without re-exporting the internal normalized-output alias.
- POST-REVIEW FULL GREEN (Node 22.21.1): the complete lint, typecheck, 50-test coverage, build, and
  package/browser smoke gate passes after all required review fixes. Coverage is now 89.26%
  statements, 85.16% branches, 90.9% functions, and 88.92% lines; `src/core` is 98.82% statements.
- POST-REVIEW FULL GREEN (Node 24.19.0): the identical complete gate passes with the same tests,
  five pre-existing network skips, coverage, build, and package-smoke evidence.
- Package dry-run passes after the review fixes: 35 files are publishable, limited to LICENSE,
  README, `lib/**`, and `package.json`. No oracle source/binary, Meta checkout, fixture, provenance,
  research, planning, or CI-only script enters the tarball.
- Final quality-review verdict: approve Task 4. Correctness, readability, architecture, security,
  performance, compatibility, CI gating, and package-boundary findings are resolved. Workflow YAML
  parsing, `git diff --check`, and the intended untracked-file inventory are clean.
- A combined completion-state patch was rejected because its final documentation context did not
  exactly match the current line. The patch was atomic; no completion state changed until the exact
  local context was read and narrower valid hunks were applied.
- Final plan-state check found the implementation-plan header still labeled the entire plan as a
  draft even though its task/checkpoint rows were current. The header now states Tasks 1–4 complete
  and Tasks 5–11 awaiting authorization, matching the persistent task plan.

## 2026-08-09 — Task 5 Authorization

- The maintainer authorized Task 5 only: reference-compatible luminance conversion, Jarosz
  downsampling to 64 by 64, and quality calculation. DCT, median, canonical bits, end-to-end
  dispatch, and later Tasks 6–11 remain out of scope.
- Implementation will follow the pinned Meta C++ operation order and be driven by failing stage-
  level tests before production numeric code is added.
- Initial pinned-source web lookup failed to retrieve the raw C++ files. This is a source-fetch
  tooling failure, not algorithm evidence; switch to a new commit-verified disposable checkout
  through the repository's existing oracle build workflow.
- The first progress-note patch used stale single-line context and was rejected atomically; reading
  the wrapped local text showed no repository change was made.
- Built a disposable oracle checkout at Meta ThreatExchange commit
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` with Apple Clang 21. The checkout and binary remain
  under `/private/tmp` and are not package inputs.
- Extended the decoder-free oracle with an opt-in diagnostics mode and generated a separate
  provenance-tracked stage corpus. It records exact luma and 64 by 64 float bit patterns for three
  deterministic vectors, including a 129 by 131 RGB case that exercises two-axis Jarosz filtering.
- RED: the focused `pdq-stages.test.ts` suite fails at import time because the luminance,
  downsample, and quality modules do not exist. This is the intended pre-implementation failure.
- First numeric GREEN attempt exposed an intentional diagnostic mismatch: gray and quality agreed,
  but one RGB luma value differed by one ULP and the filtered RGB buffer consequently diverged.
  Apple Clang assembly showed its two fused multiply-add operations; matching that order resolved
  both luma and all 4,096 filtered output bits.
- GREEN: all five focused stage tests pass. Oracle smoke, lint, and typecheck pass, and regenerating
  `stage-vectors.json` produces a byte-identical file.
- A focused coverage-only invocation passed all six stage tests but exited nonzero because repository
  global thresholds include unrelated source files absent from that focused run. This is a command-
  scope artifact; the complete coverage gate is the authoritative coverage check and passes.
- Quality review removed one full-image float allocation by explicitly consuming the internal luma
  work buffer, limited the oracle's diagnostic luma copy to diagnostic mode, documented FMA
  emulation, and added negative stage-shape tests.
- POST-REVIEW FULL GREEN (Node 22.21.1 and Node 24.19.0): lint, typecheck, 56-test coverage,
  build, package smoke, and browser-package smoke all pass with five unchanged network skips.
  Coverage is 92.41% statements, 86.85% branches, 93.47% functions, and 92.03% lines.
- The rebuilt oracle passes hash and diagnostic smoke tests, and stage-fixture regeneration remains
  byte-identical. Package dry-run includes only LICENSE, README, `lib/**`, and `package.json`; no
  fixtures, oracle source/binary, checkout, planning file, or generator script is published.
- Final quality-review verdict: approve Task 5. Correctness, readability, architecture, security,
  performance, compatibility, fixture provenance, and package-boundary findings are resolved.

## 2026-08-09 — Task 6 Authorization

- The maintainer asked to continue implementation and testing after opening draft PR #6. Task 6 is
  the next approved bounded increment: reference-compatible 64-to-16 DCT, Torben median, strict
  greater-than bit thresholding, and canonical 256-bit hexadecimal serialization.
- Public `pdq-v1` dispatch, fingerprint records, and later Tasks 7–11 remain out of scope.
- Work will again use the pinned Meta source and oracle-generated stage diagnostics, with failing
  DCT/median/bit-order tests written before production modules.
- Source inspection confirmed the DCT transform and median/serialization contracts across the
  pinned C++ and Java implementations. The optimized native compiler contracts DCT arithmetic, so
  Task 6 diagnostics will preserve scalar float operation boundaries for exact intermediate tests
  and retain normally optimized final-hash conformance as a separate check.
- Extended and rebuilt the pinned Clang oracle diagnostics to emit all 1,024 DCT intermediate bits,
  all 256 DCT output bits, the median bits, and canonical hash. Oracle smoke passes and the stage
  corpus now freezes those answers for both the minimum-size gray and filtered seeded RGB vectors.
- RED: the focused stage suite now specifies exact two-pass DCT bits, frozen median/hash answers,
  Torben even/tie behavior, strict threshold equality, Meta word order, and invalid shapes. It fails
  at import time because the Task 6 production modules do not exist, as intended.
- Initial GREEN: added isolated DCT, Torben median, and hash serialization modules. The focused suite
  passes all 10 tests, including every frozen intermediate/output float bit and both complete
  64-character oracle hashes.
- Static-gate recovery complete: replaced the over-precise source literal with equivalent
  `Math.PI` and scoped Torben's loop state to its actual lifetime. Lint, typecheck, and all 10
  focused Task 6 tests now pass with the oracle answers unchanged.
- Expanded final-hash conformance beyond the two stage vectors: the production DCT/median/hash
  pipeline exactly matches all 15 frozen raw-vector oracle hashes and qualities, including gray,
  RGB, normalized RGBA, minimum dimensions, extreme aspect ratios, flat inputs, and seeded data.
- Deterministic regeneration confirmed the expanded stage corpus SHA-256 remains
  `5cd906f5b3a836b0beb3081a4a5f55077b5f5ba60f128d09b8edefef5482cc1c`. The focused suite also
  passes on Node 24.19.0. The full Node 22 coverage run passes 60 tests with five existing network
  skips and 93.69% statement / 88.29% branch coverage; one Torben narrowing branch remains an
  uncovered Task 6 line and should receive a focused regression case before review.
- Added the smallest three-value Torben case that reaches the generic upper-candidate return. The
  full coverage gate remains green and Task 6's DCT, median, and hash modules now have 100% line and
  statement coverage; repository totals are 93.88% statements and 88.78% branches.
- FULL GREEN on Node 22.21.1 and Node 24.19.0: lint, typecheck, 60-test coverage, build, CommonJS
  package smoke, and browser-package graph smoke all pass with five unchanged network skips. The
  browser/core bundle remains Node-built-in-free and is 8.27 kB before gzip / 2.42 kB gzip.
- Entered the required multi-axis review checkpoint after both supported-runtime gates passed.
  Review scope covers tests first, then correctness, readability, architecture, security,
  performance, package contents, and documentation accuracy.
- Multi-axis review verdict: approve Task 6. Exact operation order, median ties, strict threshold,
  Meta serialization, 15-vector end-to-end conformance, fixed-size performance, package boundaries,
  and supported-runtime gates are all resolved. Dynamic cosine cross-engine confirmation remains
  assigned to the existing Task 11 real-browser gate, not silently claimed here.
- POST-DOCUMENTATION FINAL GREEN: complete `pnpm check` passes on Node 22.21.1 and Node 24.19.0.
  The rebuilt oracle smoke passes, stage regeneration remains byte-identical at SHA-256
  `5cd906f5b3a836b0beb3081a4a5f55077b5f5ba60f128d09b8edefef5482cc1c`, and `git diff --check`
  reports no whitespace errors.

## 2026-08-09 — Portable Numeric Profile Authorization

- Committed Task 6 as `3490e3c` and pushed draft PR #6. Node 22, Node 24, package integrity,
  CodeQL, and workflow analysis passed on GitHub.
- The existing `PDQ oracle conformance (Linux)` job failed on Ubuntu x64 while regenerating the
  raw corpus. The same job also failed on the preceding `6e3ccbd` revision, so this is not a Task 6
  regression.
- Reproduced the failure with an x86_64 native oracle on macOS: raw bytes and qualities remain
  stable, while multiple DCT-derived hashes differ from the arm64 corpus. The native C++ build is
  architecture-sensitive and cannot itself define a cross-platform production contract.
- The maintainer approved the proposed hardening sequence: canonical arm64 oracle CI, stage-corpus
  comparison, frozen DCT bits, same-source WASM differential, and a final portable numeric-profile
  decision before public dispatch.
- Updated the oracle-conformance job to GitHub's `ubuntu-24.04-arm` runner and added a second exact
  comparison for the internal-stage corpus. The oracle README now distinguishes the canonical
  arm64 native-reference check from the ordinary x64 Node portability matrix.
- Local verification passes: Ruby parses the workflow YAML, `actionlint` reports no issues, the
  arm64 oracle smoke succeeds, and regenerated 16-vector raw plus 3-vector stage corpora are both
  byte-identical to their committed fixtures.
- CI-checkpoint review verdict: approve. The change pins the previously implicit architecture,
  adds no dependency or production path, preserves the independent x64 Node matrix, documents the
  native-reference boundary, and introduces no security or performance exposure. The real hosted
  runner remains the final verification for compiler availability and exact fixture agreement.
- Added an oracle-derived 64-by-64 identity-basis stage vector and a test that requires a frozen
  1,024-coefficient production matrix. Regeneration produced a four-vector corpus. The first RED
  command did not reach Vitest because the ambient `node` executable was older than the Corepack
  version on `PATH`; rerun must use the repository's supported fnm-selected Node 22 executable.
- Environment diagnosis confirmed ambient `/usr/local/bin/node` is Node 16 while supported Node
  22.21.1, 22.22.1, and 24.19.0 are available through fnm. The first fnm retry then hit pnpm's
  documented non-TTY dependency reconciliation guard; the established local recipe is `CI=true`
  with fnm-selected Node, not a product-code change.
- RED confirmed under supported Node 22: the focused stage suite failed at import because the
  frozen DCT matrix module did not exist. GREEN: the checked-in generator derived all 1,024 uint32
  coefficient bits from the identity fixture, `dct.ts` now decodes that constant once instead of
  calling `Math.cos`, and all 11 focused stage tests pass.
- The generated constant is 9,596 source bytes and contains no runtime `Math.cos`, `Math.sin`, or
  `Math.sqrt`. Lint and typecheck pass, and a second generator run leaves the matrix module
  byte-identical, proving deterministic derivation from the fixture. The four-vector stage corpus
  SHA-256 is `2fae33786cb4ae09021bc8fda9fa9e457908d10837ecd790b41830dd8374f185`.
- GitHub run `31322966626` fully passes. The hosted `PDQ oracle conformance (Linux arm64)` job built
  the pinned Clang 18 oracle and accepted both exact corpora; Node 22, Node 24, package integrity,
  workflow analysis, and CodeQL also pass. The canonical CI checkpoint is closed.
- WASM reconnaissance found no local Emscripten toolchain. Docker is available and its daemon is
  reachable outside the sandbox, but the upstream-documented `emscripten/emsdk:3.1.7` image is not
  cached. A network pull is required for the disposable same-source build.
- Pulled the upstream-documented Emscripten 3.1.7 image and successfully compiled the exact raw
  oracle wrapper plus pinned translation units into a disposable 201 KiB `.wasm` and 93 KiB Node
  launcher. Docker emulated the image's amd64 platform on the arm64 host. Direct execution of the
  generated launcher is unavailable from the temporary mount, so comparisons will invoke it
  through supported Node explicitly.
- The first explicit Node launch exits before oracle metadata and prints the minified one-line
  launcher as source context, which obscures the actual exception in normal terminal truncation.
  The next diagnostic captures only the child status/stdout and stderr suffix to identify the glue
  compatibility issue before changing compiler flags.
- Child-process inspection shows status 7, no stdout, and stderr truncated at exactly 65,536 bytes
  after only the source-location line and minified source line. The useful exception text is lost
  behind the one-line optimized glue; retrying the 2022-era launcher on its contemporary Node 16
  runtime is the smallest compatibility diagnostic before rebuilding with readable assertions.
- Node 16 runs the Emscripten 3.1.7 launcher correctly. The new decoder-free comparator confirms
  pinned metadata, then runs all committed raw and stage inputs. WASM matches all 1,024 identity-
  basis coefficient bits, all qualities, 8 of 16 raw hashes, and 1 of 4 complete stage vectors.
  Differences begin in arithmetic: 1 RGB luma bit, 3,815 filtered-downsample bits, 973/1,012 DCT
  intermediate bits, and 256/252 DCT output bits on the two diagnostic image vectors. This isolates
  the split from coefficient generation and demonstrates fused native versus unfused WASM float
  evaluation, not decoder variance.
- Built a second Apple Clang 21 arm64 native oracle with `-ffp-contract=off`. Its generated raw and
  four-vector stage files are byte-identical to the WASM files, proving contraction is the sole
  cause of every observed differential in this corpus. The same-source WASM checkpoint is complete.
- PORTABLE-PROFILE RED: regenerated the committed raw and stage answers from the unfused native
  oracle. The existing fused TypeScript implementation now fails five focused behaviors: RGB luma,
  filtered downsample propagation, full raw hashes, both DCT passes, and median/final hashes. The
  frozen identity-basis coefficient test remains valid because coefficients are unchanged.
- PORTABLE-PROFILE GREEN: RGB luminance and DCT now separately round float32 multiplication and
  addition; the native oracle build pins `-ffp-contract=off`. All 11 focused tests pass, and the
  same-source WASM comparator reports 16/16 exact raw vectors plus 4/4 exact complete stage vectors
  with no mismatch at any checked coefficient, luma, downsample, DCT, median, hash, or quality field.
- Accepted and documented the portable unfused `pdq-v1` numeric profile, its exact operation
  boundaries, versioning rule, artifact checksums, native/WASM evidence, and no-runtime-WASM
  boundary. ADR 0001, the approved specification, implementation plan, fixture provenance, and
  oracle documentation now point to the same contract.
- Added a reproducible local-only WASM oracle build script pinned to the immutable Emscripten 3.1.7
  image digest. It verifies the upstream checkout and keeps all generated artifacts outside the
  repository/package. The script help path, executable mode, ShellCheck, and `git diff --check`
  pass; a clean scripted rebuild and differential remain to verify.
- Scripted rebuild diagnostics found two invocation issues before Docker ran: the ambient Node 16
  Corepack mismatch requires the established fnm/CI recipe, and pnpm 11 forwards the documented
  separator as a literal leading `--`. Both native and WASM shell builders must accept that
  separator so their documented package-script commands are actually executable.
- Added leading-separator support to both builders. The digest-pinned WASM script now rebuilds
  successfully and its comparator is exactly 16/16 raw plus 4/4 stage. The corrected native package
  command rebuilds Apple Clang 21 with `-ffp-contract=off`; regenerated raw and stage fixtures are
  both byte-identical to the committed portable corpus.
- FULL GREEN on Node 22.22.1 and Node 24.19.0: lint, typecheck, 61-test coverage, build, CommonJS
  package smoke, and browser-package graph smoke all pass with five unchanged network skips.
  Coverage is 93.92% statements, 88.78% branches, 94.33% functions, and 93.60% lines. No WASM,
  oracle source, fixture, or generator enters the current public bundle.
- Multi-axis review found two required cleanup items before approval: the oracle README retains one
  stale pre-profile claim about the old saved corpus, and the differential report should name the
  immutable Emscripten image digest while validating array lengths explicitly. Correctness,
  architecture, security, and performance review otherwise found no blocking issue.
- Review follow-up passes: documentation now describes only the accepted corpus, comparator arrays
  validate exact lengths, and reports identify the immutable Emscripten digest. An Apple Clang 21
  x86_64 unfused build also regenerates both accepted corpora byte-for-byte, closing the original
  architecture concern directly.
- Final local review verdict: approve. Tests specify the coefficient and arithmetic contract before
  implementation; production changes are pure, fixed-size, browser-safe TypeScript; build tooling
  pins source, compiler semantics, and image digest; artifacts stay outside the package; no secret,
  unbounded input, runtime dependency, or public API change is introduced.
- POST-REVIEW FINAL GREEN: complete Node 22.22.1 and Node 24.19.0 gates pass again (61 tests plus
  five network skips), alongside ShellCheck, actionlint, JavaScript syntax checks, native oracle
  smoke, deterministic matrix regeneration, package/browser smoke, and `git diff --check`.
- Committed the portability checkpoint as `826190a` and pushed draft PR #6. GitHub run
  `31323883320` passes Linux arm64 oracle conformance for both new unfused corpora, Node 22, Node 24,
  and package integrity. Workflow analysis and CodeQL also pass. The portability checkpoint is
  complete and Tasks 7–11 remain awaiting authorization.

## 2026-08-09 — Task 7 Authorization

- The maintainer merged draft PR #6 and authorized the next bounded increment: Task 7 public
  `pdq-v1` raw-pixel dispatch. Tasks 8–11 and encoded-image adapters remain out of scope.
- Fast-forwarded local `main` from `d4f88fa` to merged commit `8e373cc` and created
  `codex/pdq-public-api` from that clean baseline.
- Task 7 will be test-driven against the approved fingerprint record, stable shared pixel
  validation, and every committed gray/RGB/RGBA raw vector before production composition is added.
- Repository inspection confirms no standalone `vitest.config.ts` exists; Vitest configuration is
  elsewhere/default-driven. This was a harmless inspection miss and did not change the worktree.
- RED (Task 7): the focused PDQ/core run executes 18 tests. All 11 existing core tests pass, while
  all seven new public-dispatch behaviors fail because the dispatcher rejects `pdq-v1` before
  validation or hashing. This proves the new tests exercise the missing production boundary.
- Initial GREEN behavior passes all 18 focused tests, including every raw corpus answer. The first
  typecheck then failed because the overload implementation checked an algorithm copied into a
  plain `string`, so TypeScript could not narrow the options union for the legacy branch. Extract
  the already-existing BlockHash body into a typed helper and keep runtime unknown-algorithm
  rejection in the overload dispatcher.
- Typed GREEN: the dispatcher now has correlated BlockHash and PDQ overloads plus a small typed
  legacy helper. Focused conformance/core tests remain 18/18 and TypeScript passes under Node
  22.22.1.
- The first README patch used an imprecise code-fence context and was rejected atomically; no
  documentation content changed. Line-number inspection supplied the exact local context for the
  narrower patch below.
- Full coverage is GREEN under Node 22.22.1: 68 passed, five pre-existing network tests skipped,
  with 94.04% statements and 88.88% branches. ESLint also passes. README now documents the shipped
  raw-pixel PDQ call, result semantics, input formats, and decoder boundary.
- Built-package GREEN under Node 22.22.1: TypeScript and Vite builds pass; the exact PDQ vector
  succeeds through root, core, browser CommonJS, and browser ESM exports; and the browser graph
  remains free of forbidden Node built-ins. The shared browser/core ESM chunk is 29.12 kB before
  gzip and 7.79 kB gzip after including the frozen PDQ core.
- FULL GREEN on Node 22.22.1 and Node 24.19.0: lint, strict typecheck, 68 passing tests plus five
  unchanged network skips, coverage, build, and package smoke all pass with identical results.
  Generic union and algorithm-specific overload declarations are present in the built package.
- Entered the required multi-axis quality review after both supported-runtime gates passed.
- Review found one required type-safety cleanup: the broad union overload preserved generic calls
  but also admitted mismatched image/algorithm pairs at compile time. Remove it so direct PDQ calls
  require tagged pixels, and make the conformance fixture helper construct each discriminated union
  member explicitly so the test is strict-TypeScript-valid rather than only transpileable.
- Review cleanup GREEN: focused tests are 18/18, ESLint passes, and an explicit strict TypeScript
  check of the new conformance test passes. The published declarations now expose only the two
  correlated call overloads.
- Package dry-run rebuilds successfully and contains only LICENSE, README, `lib/**`, and
  `package.json`; no conformance fixture, oracle, generator, planning file, or test script is
  published. `git diff --check` is clean, and runtime-neutral source has no Node import.
- Multi-axis review verdict: approve Task 7. The production path only composes the accepted stages,
  shares the frozen validator/normalizer, exposes correlated typed overloads, adds no dependency or
  decoder behavior, and keeps the legacy callback and BlockHash results unchanged. Exact corpus,
  entrypoint, malformed-input, package-boundary, and supported-runtime evidence are sufficient.
- POST-REVIEW FINAL GREEN: complete `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 68
  passing tests, five unchanged network skips, 94.04% statement / 88.88% branch coverage, strict
  types, builds, and exact root/core/browser package smoke. Task 7 is ready for commit and CI.

## 2026-08-09 — Task 8 Authorization

- PR #7 merged as `b2edec5` with Node 22, Node 24, package integrity, Linux arm64 oracle,
  workflow-analysis, and CodeQL checks green.
- Fast-forwarded local `main` to `b2edec5` and created `codex/fingerprint-codec` from that clean
  baseline. The maintainer authorized Task 8; Tasks 9–11 and adapters remain out of scope.
- Task 8 will be test-driven against the approved schema-1 PDQ and BlockHash record contracts,
  strict malformed-input rejection, canonical lowercase output, and round-trip behavior.
- RED: added focused codec tests for canonical PDQ and BlockHash round trips, uppercase
  normalization, malformed fixed fields, invalid derived BlockHash metadata, unknown fields,
  invalid JSON, and serialization-time revalidation. The valid cases fail because the codec is not
  implemented (`3 failed, 25 passed`); malformed cases currently throw for that same missing export
  and must be rechecked after implementation.
- The first combined implementation patch did not apply because its progress-file context used
  wording that differed from the existing authorization entry. `apply_patch` rejected the patch
  atomically, so no production file or export was partially changed.
- GREEN: the minimal codec implementation and public re-exports make all 28 focused cases pass.
  TypeScript and ESLint also pass under Node 22.22.1.
- FULL GREEN before review: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 96 tests
  passing, five unchanged network tests skipped, 94.15% statement / 89.72% branch coverage, strict
  typecheck, builds, and packed root/core/browser codec smoke checks.
- Multi-axis review found one small cleanup: remove an unreachable internal algorithm assertion and
  explicitly cover PDQ quality endpoints, both valid BlockHash methods, non-string JavaScript
  input, unsafe derived bit lengths, and canonical field reordering.
- POST-REVIEW FINAL GREEN: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 101 tests
  passing, five unchanged network tests skipped, 94.64% statement / 90.9% branch coverage, strict
  typecheck, builds, and packed entrypoint smoke tests. `git diff --check` is clean.
- Review verdict: approve Task 8. The codec reconstructs exact schema-v1 records, validates all
  untrusted fields before returning or serializing, adds no dependency, stays synchronous and
  runtime-neutral, preserves the legacy callback/hash contract, and does not absorb Task 9 matching
  policy or Task 12 decoding concerns.

## 2026-08-09 — Task 9 Authorization

- The maintainer requested the reviewed Task 8 checkpoint be committed and authorized moving to
  Task 9 on the current feature branch as a separate commit.
- The first `git add`/`git commit` attempt was blocked because the workspace sandbox could not
  create `.git/index.lock`. Retrying the same scoped Git operation with approved Git metadata
  access succeeded; Task 8 is committed as `2da5ae8` (`Add canonical fingerprint codec`).
- Task 9 is limited to mathematical Hamming comparison, explicit incompatibility, a named PDQ
  starting-policy constant, and an opt-in policy evaluator. Task 10 differential expansion and
  later runtime adapters remain out of scope.
- RED: added 22 focused tests covering distances 0, 31, 32, and 256; BlockHash comparison;
  algorithm/parameter/bit-length incompatibility; malformed hashes; 100 seeded symmetry/identity
  iterations; explicit starting and custom policies; quality eligibility; and invalid policy
  bounds. Fifteen behavior tests fail because the Task 9 exports do not exist; seven rejection tests
  currently throw for that same missing-function reason and must be rechecked after implementation.
- GREEN: implemented decoder-free hexadecimal Hamming comparison, explicit incompatibility,
  `PDQ_STARTING_POLICY`, policy/runtime validation, and a discriminated opt-in PDQ policy result.
  All 22 focused tests pass; strict TypeScript and ESLint also pass under Node 22.22.1.
- The first combined documentation/package-smoke patch used README context with an incorrect line
  break and was rejected atomically. No README, smoke script, or progress content changed before
  the narrower patches below.
- FULL GREEN before review: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 123 tests
  passing, five unchanged network tests skipped, 94.43% statement / 91.08% branch coverage, strict
  types, builds, and packed root/core/browser comparison-policy smoke checks.
- REVIEW RED: four new JavaScript-boundary regressions fail against the initial implementation:
  unsupported identical algorithms, invalid schema/encoding headers, and equal but internally
  inconsistent PDQ/BlockHash bit lengths were incorrectly reported as comparable.
- REVIEW GREEN: comparison now validates supported schema headers and internal algorithm metadata
  before returning a comparable result. Genuine differences between valid records still return the
  approved incompatibility reasons. The focused suite passes all 36 tests, including untyped
  non-object, parameter, quality, policy, algorithm, and incompatible-input guards.
- POST-REVIEW FINAL GREEN: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 137 tests
  passing, five unchanged network tests skipped, 95% statement / 92.35% branch coverage, strict
  types, builds, and packed root/core/browser smoke tests.
- Multi-axis review verdict: approve Task 9. Comparison is deterministic, symmetric, bounded, and
  linear in the fixed fingerprint text; policy cannot silently affect distance; incompatible and
  invalid inputs remain distinguishable; the implementation adds no dependency or runtime I/O and
  stays inside the pure browser-safe core.

## 2026-08-09 — Task 10 Authorization

- Committed reviewed Task 9 as `bb80bc9` (`Add fingerprint comparison policy`) after its cached
  diff check passed. The maintainer authorized moving directly to Task 10.
- Task 10 will add only development conformance tooling, an opt-in native-oracle batch seam, seeded
  differential tests, mismatch reduction guidance, and numeric-discipline evidence. It will not
  change `pdq-v1`, add runtime WASM, or begin Task 11 browser-engine work.
- Two exploratory Node 22 type-stripping commands failed as expected for this source layout: first
  directory resolution could not find `./src/core`, then explicit `index.ts` loading could not
  resolve extensionless ESM imports. The harness will use the normal built `lib/core` artifact
  instead of repeating source-loader experiments.
- Captured the TDD red baseline for the deterministic runner: the focused Vitest suite fails because `scripts/pdq-differential.mjs` does not exist yet.
- Captured the TDD red baseline for batch mode with the current metadata/diagnostics-capable native oracle: all existing smoke checks reach the new `--batch` assertion, which fails with the pre-batch usage response.
- GREEN: rebuilt the pinned Apple Clang 21 arm64 oracle with `-ffp-contract=off`; legacy single,
  metadata, diagnostics, two-request batch, and truncated-batch smoke checks pass.
- GREEN: all six deterministic runner CLI tests pass, the distributable core builds, and a
  100-vector end-to-end trial returned exact hash and quality equality.
- ACCEPTED DIFFERENTIAL: two runs of 10,000 vectors with seed `0x5eedc0de` each returned 10,000
  exact matches and zero mismatches. Stable source/oracle-input checksums were identical; measured
  comparison times were 4,089.338 ms and 4,122.152 ms.
- REVIEW: found and fixed a deterministic-generator collision where numeric seed zero was silently
  mapped to `0x6d2b79f5`. Zero now remains a distinct (degenerate but valid) xorshift32 stream, and a
  regression test freezes that distinction. Oracle result parsing also rejects quality outside
  the public 0–100 contract.
- REVIEW: executing the initially documented `pnpm pdq:differential -- --plan-only ...` form proved
  that pnpm 11 forwards the standalone separator to this strict script, which correctly rejected it.
  The documented package invocation now omits that separator and matches the verified command.
- POST-REVIEW FINAL GREEN: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 144 tests
  passing, five unchanged network skips, 95% statement / 92.35% branch coverage, strict types,
  builds, and packed root/core/browser smoke tests. The rebuilt native oracle also passes all single,
  diagnostic, metadata, batch, and malformed-batch smoke checks.
- The first package dry-run reached a successful prepack build but failed on the user's pre-existing
  root-owned npm cache. Repeating it with a fresh isolated `/tmp` cache passed and confirmed the 75
  published files remain limited to LICENSE, README, `lib/**`, and `package.json`; the native wrapper,
  differential runner, fixtures, tests, and planning files are excluded.
- Multi-axis review verdict: approve Task 10 after fixing the zero-seed collision and documented
  pnpm invocation. The change is development-only, validates all framed and oracle boundaries, adds
  no dependency or runtime WASM/native path, preserves legacy and public core behavior, and provides
  reproducible exact equality evidence at the required scale.

## 2026-08-09 — Task 11 Authorization

- Committed Task 10 as `779b67b` (`Add large PDQ differential testing`) with a clean worktree. The
  maintainer authorized Task 11 on the current feature branch.
- Audited the current package/browser smoke scripts and CI. Existing browser ESM is executed only
  inside Node; the HTML fixture is not launched, has no worker, and no TypeScript consumer-resolution
  matrix exists.
- A broad shell inspection used the ambient runtime for `pnpm list` and hit an incompatible Corepack
  path, then an explicit Node 22 retry hit the sandboxed pnpm store database. Neither command changed
  package state; all implementation commands will keep using the approved explicit Node runtime.
- The first registry lookup was blocked by sandbox DNS and was stopped before its long final retry.
  The approved network retry returned current Playwright version 1.62.1.
- RED: added four focused plan-contract tests. The two positive tests failed because the packed
  package and browser-engine runners did not exist; strict unknown-argument cases already exited
  nonzero for the same missing-script reason.
- GREEN (packed consumers): the tarball-only harness passes two runtime consumers (CommonJS and ESM),
  six public/compatibility subpaths, and strict TypeScript consumers under `node16`, `nodenext`, and
  `bundler` resolution.
- Added Playwright 1.62.1 as a development-only dependency after the repository's supply-chain
  policy accepted the lockfile update. Its local license is Apache-2.0.
- The first browser run was blocked solely because the workspace sandbox prohibits loopback listen.
  The approved unchanged retry passed Chromium 151.0.7922.34, Firefox 153.0, and WebKit 26.5.
- GREEN (real browsers): all three engines produced exact expected hash and quality for gray8, rgb8,
  and rgba8 on both the main thread and a module worker. The observed request graphs contained only
  the HTML page, worker module, packed browser entry, and packed core chunk, with no WASM request.
- GREEN (package command): the expanded `pnpm test:package` passes the existing self-reference and
  browser-graph checks plus the new isolated tarball runtime/type matrix.
- REVIEW: the initial isolated ESM fixture accessed root and `/node` through their CommonJS default
  objects, which would not catch a named-export interop regression. It now imports the documented
  `imageHash` and `fingerprintPixels` names directly.
- Dependency review: Playwright is a direct standalone development path and Apache-2.0 licensed.
  The production audit is clean. A full development audit reports pre-existing high advisories in
  ESLint's `flatted` path and Vitest/typescript-eslint's older `picomatch` path; neither traverses
  Playwright or enters the published dependency graph.
- POST-REVIEW FINAL GREEN: `pnpm check` passes on Node 22.22.1 and Node 24.19.0 with 148 tests
  passing, five unchanged network skips, 95% statement / 92.35% branch coverage, strict types,
  builds, static browser-graph checks, and isolated packed runtime/type consumers.
- The opt-in real-browser gate passes under both Node 22 and Node 24 for Chromium, Firefox, and
  WebKit on the main thread and in a module worker. The package dry-run still contains only LICENSE,
  README, `lib/**`, and `package.json`; Playwright code, browser binaries, harnesses, and fixtures are
  not published.
- Multi-axis review verdict: approve Task 11 after strengthening named ESM interop coverage. The
  loopback server is path-confined to a generated temporary consumer, cleanup targets only its
  `mkdtemp` root, commands avoid shell interpolation, browser processes close in `finally`, and CI
  pins execution through the lockfile-matched Playwright/browser versions.
- The first workflow-YAML syntax probe used a keyword supported only by newer Ruby/Psych and failed
  before parsing. Repeating the read with the system Ruby 2.6-compatible call parsed the workflow
  successfully; `git diff --check` is also clean.

## 2026-08-09 — Tasks 12–14 Adapter Integration

- Rebasing `codex/image-preparation-adapters` onto the authoritative Tasks 8–11 tip `631ac3f`
  produced the five expected overlaps: README, root/browser package smokes, `/browser`, and `/core`.
  Resolutions preserved the codec, comparison, policy, historical exports, packed consumers, and
  browser harness while adding shared decoder contracts, strict region extraction, and runtime
  adapters.
- The Node 22 full gate passes with 15 test files, 195 passing tests, five unchanged network skips,
  lint, strict types, coverage, build, legacy smoke tests, packed CommonJS/ESM consumers, and
  TypeScript `node16`, `nodenext`, and `bundler` consumers.
- The packed browser matrix now exercises `ImageData`, `Blob`, and `File` through both
  `decodeImage()` plus `fingerprintPixels()` and `fingerprintImage()`. Chromium 151.0.7922.34,
  Firefox 153.0, and WebKit 26.5 pass on the main thread and in a module worker with no WASM request.
- Tasks 12–14 are complete. Task 15 retains licensed cross-decoder tolerance, ICC/profile, and
  categorized variance evidence; no cross-decoder exactness claim was added.
