# PDQ v1 Implementation Plan

Status: Tasks 1–16 implemented and verified; Tasks 17–18 remain open
Updated: 2026-08-09

## Overview

Implement an opt-in, reference-conformant `pdq-v1` fingerprint in the existing TypeScript package
without changing the legacy callback API or serialized Block Mean Value hashes. Work proceeds from
the highest-risk dependency—the pinned C++ oracle and numeric conformance—through the portable
pixel core, record/comparison utilities, runtime packaging, encoded-image adapters, benchmarks, and
release evidence.

The cross-runtime foundation landed on `main` in `2686eac`. Tasks 2–11 are complete through
`631ac3f`; the image-preparation branch implements Tasks 12–14 additively on that exact base.

## Approved Architecture

- The root `imageHash()` callback API and every legacy hash remain compatibility-locked.
- `pdq-v1` is a synchronous TypeScript algorithm exposed through `image-fingerprint/core` and re-exported
  by explicit Node and browser entrypoints.
- Meta ThreatExchange commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` is normative.
- Same-source WASM is the primary differential/performance comparator; `pdq-wasm` is secondary.
- Tagged, tightly packed `gray8`, `rgb8`, and straight-alpha `rgba8` inputs are accepted. RGBA is
  composited over white with the approved deterministic integer rounding rule.
- Exact equality is promised for identical normalized pixels. Separately decoded encoded images
  are tested against documented tolerance rather than promised exact equality.
- Fingerprint schema version 1 uses canonical lowercase hex, `bitLength`, and mandatory PDQ quality.
- Hamming comparison is separate from caller-selected distance and minimum-quality policy.
- Crop detection and selection remain outside the library. Callers may use the strict core region
  extractor with their own coordinates, then hash the full image and each extracted region as
  normal pixel inputs.

## Dependency Graph

```text
Cross-runtime foundation
  -> pinned C++ oracle and licensed vectors
      -> tagged pixel normalization
          -> PDQ numeric stages
              -> end-to-end pdq-v1 dispatch
                  -> record codec and comparison policy
                      -> package/browser conformance
                          -> encoded-image adapters
                              -> tolerance, performance, and product calibration
                                  -> release documentation
```

## Phase 0: Baseline the Landed Foundation

### Task 1: Verify the landed cross-runtime foundation

**Status:** Landed on `main`; fresh-main verification recorded during plan synchronization.

**Description:** Verify the landed `/core`, `/node`, `/browser`, typed BlockHash, build, and
package-smoke work so PDQ starts from a known green baseline.

**Acceptance criteria:**

- [x] Legacy golden hashes and callback behavior are unchanged by the foundation change.
- [x] Root, historical `lib` paths, `package.json`, `/core`, `/node`, and `/browser` load from the
  packed artifact.
- [x] The working tree and ownership of any remaining changes are unambiguous before PDQ files are
  edited.

**Verification:**

- [x] `pnpm run check` on the synchronized `d4f88fa` baseline.
- [x] `npm pack --dry-run` on the synchronized `d4f88fa` baseline.
- [x] Record the baseline branch/commit and command output in the progress log.

**Dependencies:** None.

**Files likely touched:** None unless fresh-main verification exposes a regression.

**Estimated scope:** Small verification gate; implementation is already merged.

## Checkpoint A: Foundation

- [x] Task 1 implementation was reviewed and merged independently of PDQ.
- [x] Node 22 and Node 24 verification are green locally and in the merged CI matrix.
- [x] Legacy compatibility evidence is recorded.

## Phase 1: Build the Normative Test Oracle

### Task 2: Add a reproducible pinned C++ oracle harness

**Status:** Complete on 2026-08-09; cross-platform checkpoint evidence remains open.

**Description:** Add local-only tooling that obtains the pinned ThreatExchange revision outside the
published package, compiles a minimal raw gray/RGB PDQ wrapper, and emits canonical hex plus quality.

**Acceptance criteria:**

- [x] The exact commit, compiler, flags, source paths, and BSD notice are recorded.
- [x] The harness accepts explicit dimensions, format, and tightly packed bytes without an image
  decoder.
- [x] No Meta source, restricted upstream image, compiler output, or WASM asset enters the npm
  package.

**Verification:**

- [x] Run the local oracle build command from a clean temporary directory.
- [x] Hash one gray and one RGB smoke vector twice with identical output.
- [x] `npm pack --dry-run` excludes all temporary oracle artifacts.

**Dependencies:** Task 1.

**Files likely touched:**

- `tools/pdq-oracle/README.md`
- `tools/pdq-oracle/main.cpp`
- `scripts/build-pdq-oracle.sh`
- `package.json`

**Estimated scope:** Medium.

### Task 3: Generate the redistribution-safe conformance corpus

**Status:** Complete on 2026-08-09.

**Description:** Produce deterministic synthetic raw vectors and their pinned C++ hash/quality
answers, with a manifest that records generation parameters and provenance.

**Acceptance criteria:**

- [x] Corpus covers 5×5 minimum, 64×64 fast path, odd dimensions, extreme aspect ratios, flat
  colors, gradients, edges, checkerboards, RGB-equals-gray, alpha cases, and seeded random data.
- [x] Expected hash and quality are generated only by the pinned oracle and include checksums.
- [x] Re-running generation produces no fixture diff.

**Verification:**

- [x] Run the fixture-generation command twice and verify byte-identical outputs.
- [x] Validate fixture schema and checksums in an offline Vitest test.
- [x] Review the provenance manifest before merging.

**Dependencies:** Task 2.

**Files likely touched:**

- `scripts/generate-pdq-fixtures.mjs`
- `__tests__/fixtures/pdq/raw-vectors.json`
- `__tests__/fixtures/pdq/PROVENANCE.md`
- `__tests__/pdq-fixtures.test.ts`

**Estimated scope:** Medium.

## Checkpoint B: Oracle

- [x] The oracle is reproducible on two clean environments (Apple clang 21 on macOS and Clang 19
  on Debian Linux arm64); a recurring Ubuntu/Clang CI job is configured to preserve this evidence.
- [x] Fixed vectors have documented origin and checksums.
- [x] Default tests consume generated answers but do not require network access or a C++ compiler.

## Phase 2: Implement the Portable PDQ Core Test-First

### Task 4: Generalize and validate the tagged pixel contract

**Status:** Complete on 2026-08-09.

**Description:** Replace the RGBA-only portable input assumption with the approved tagged pixel
union and isolate normalization/validation from algorithm dispatch.

**Acceptance criteria:**

- [x] `gray8`, `rgb8`, and `rgba8` enforce safe dimensions, exact packed lengths, and supported
  typed-array containers.
- [x] RGBA-to-RGB normalization applies the approved white composite rule exactly, including alpha
  0, 1, 127, 128, 254, and 255 boundary cases.
- [x] Existing BlockHash behavior remains identical when passed tagged RGBA input.

**Verification:**

- [x] `pnpm test -- __tests__/core.test.ts __tests__/pixels.test.ts`
- [x] `pnpm typecheck`

**Dependencies:** Task 1; Task 3 supplies later conformance answers but does not block validation.

**Files likely touched:**

- `src/core/types.ts`
- `src/core/pixels.ts`
- `src/core/fingerprint.ts`
- `__tests__/pixels.test.ts`
- `__tests__/core.test.ts`

**Estimated scope:** Medium.

### Task 5: Implement luminance, Jarosz downsample, and quality

**Status:** Complete on 2026-08-09.

**Description:** Port the first half of the pinned PDQ numeric pipeline with explicit float32
discipline and stage-level tests.

**Acceptance criteria:**

- [x] Gray and RGB luminance use the frozen byte and coefficient semantics.
- [x] Two-pass Jarosz filtering and decimation produce the reference 64×64 stage outputs for
  diagnostic vectors.
- [x] Quality exactly matches the oracle, including 0 and 100 boundaries.

**Verification:**

- [x] Run focused stage tests against oracle-generated diagnostics.
- [x] Run fixed-vector quality differential tests with zero mismatch.
- [x] `pnpm lint && pnpm typecheck`

**Dependencies:** Tasks 3 and 4.

**Files likely touched:**

- `src/core/algorithms/pdq/luminance.ts`
- `src/core/algorithms/pdq/downsample.ts`
- `src/core/algorithms/pdq/quality.ts`
- `__tests__/pdq-stages.test.ts`

**Estimated scope:** Medium.

### Task 6: Implement DCT, Torben median, and canonical hash bits

**Status:** Complete on 2026-08-09, including the pre-public portability hardening checkpoint.

**Description:** Port the second half of PDQ and independently prove median ties, bit order, and
64-character serialization.

**Acceptance criteria:**

- [x] The 64-to-16 DCT preserves reference operation order and float32 behavior.
- [x] Torben median and strict `>` thresholding match tie-heavy reference cases.
- [x] Bit positions serialize exactly as 64 lowercase hex characters in Meta word order.

**Verification:**

- [x] Run DCT/median/bit-order unit tests.
- [x] Compare fixed stage outputs and final hash text with the oracle.
- [x] Freeze all DCT coefficient bits, disable native contraction, and prove the accepted profile
  against same-source WASM before public dispatch.
- [x] `pnpm lint && pnpm typecheck`

**Dependencies:** Task 3.

**Files likely touched:**

- `src/core/algorithms/pdq/dct.ts`
- `src/core/algorithms/pdq/median.ts`
- `src/core/algorithms/pdq/hash.ts`
- `__tests__/pdq-stages.test.ts`
- `docs/modernization/pdq-numeric-conformance.md`

**Estimated scope:** Medium.

### Task 7: Integrate `pdq-v1` into fingerprint dispatch

**Status:** Complete and merged in `b2edec5` on 2026-08-09.

**Description:** Compose the numeric stages into the approved `PdqFingerprint` and expose it through
the runtime-neutral public API.

**Acceptance criteria:**

- [x] `{ algorithm: 'pdq-v1' }` returns schema version 1, canonical hex, bit length 256, and required
  integer quality.
- [x] Either dimension below 5 and all malformed buffers fail before hashing with stable categories.
- [x] Every fixed gray, RGB, and RGBA vector matches the expected hash and quality exactly.

**Verification:**

- [x] `pnpm test -- __tests__/pdq-conformance.test.ts __tests__/core.test.ts`
- [x] `pnpm test:coverage`
- [x] `pnpm typecheck`

**Dependencies:** Tasks 4–6.

**Files likely touched:**

- `src/core/algorithms/pdq/index.ts`
- `src/core/fingerprint.ts`
- `src/core/types.ts`
- `src/core/index.ts`
- `__tests__/pdq-conformance.test.ts`

**Estimated scope:** Medium.

## Checkpoint C: Exact Core

- [x] All fixed vectors have zero hash and quality mismatch against C++.
- [x] BlockHash golden results remain unchanged.
- [x] The core is synchronous, stateless, decoder-free, and free of Node/DOM imports.
- [x] Review numeric choices before expanding the API surface.

## Phase 3: Add Durable Records and Explicit Comparison

### Task 8: Implement fingerprint parsing and canonical serialization

**Status:** Complete in rebased commit `bfd48d5` on 2026-08-09.

**Description:** Add strict runtime validation and round-trip helpers for schema version 1 records.

**Acceptance criteria:**

- [x] PDQ parsing validates schema, algorithm, encoding, 64 hex characters, bit length 256, and
  integer quality 0–100.
- [x] Uppercase input may be accepted but always serializes to canonical lowercase.
- [x] BlockHash record validation also checks `bitsPerSide`, method, and derived bit length.

**Verification:**

- [x] Run valid, malformed, unknown-field, and round-trip record tests.
- [x] `pnpm typecheck`

**Dependencies:** Task 7.

**Files likely touched:**

- `src/core/fingerprint-codec.ts`
- `src/core/types.ts`
- `src/core/index.ts`
- `__tests__/fingerprint-codec.test.ts`

**Estimated scope:** Small.

### Task 9: Implement Hamming comparison and opt-in PDQ match policy

**Status:** Complete in rebased commit `723d26f` on 2026-08-09.

**Description:** Add mathematical comparison with explicit incompatibility and a separate named
policy helper.

**Acceptance criteria:**

- [x] Hamming distance is symmetric, bounded, and tested at 0, 31, 32, and 256.
- [x] Algorithm, BlockHash parameter, and bit-length mismatches return `comparable: false` with the
  approved reason instead of `matches: false`.
- [x] `PDQ_STARTING_POLICY` is explicit; policy eligibility requires both qualities to meet the
  selected minimum and never alters distance.

**Verification:**

- [x] `pnpm test -- __tests__/fingerprint-comparison.test.ts`
- [x] Property tests or seeded loops verify symmetry and identity.
- [x] `pnpm lint && pnpm typecheck`

**Dependencies:** Task 8.

**Files likely touched:**

- `src/core/fingerprint-comparison.ts`
- `src/core/types.ts`
- `src/core/index.ts`
- `__tests__/fingerprint-comparison.test.ts`

**Estimated scope:** Small.

### Task 10: Run large differential and numeric-discipline tests

**Status:** Complete in rebased commit `c375daa` on 2026-08-09.

**Description:** Prove the TypeScript implementation against thousands of seeded C++ vectors and
use same-source WASM only to investigate discrepancies and establish a performance goalpost.

**Acceptance criteria:**

- [x] At least 10,000 valid seeded raw inputs have exact hash and quality equality with C++.
- [x] Every mismatch is reduced to a committed regression vector before numeric code changes.
- [x] The minimum necessary `Math.fround`/`Float32Array` discipline is documented; no runtime WASM
  dependency is introduced.

**Verification:**

- [x] Run the opt-in differential command with its seed and summary recorded.
- [x] Repeat the accepted seed with identical results.
- [x] Run `pnpm check` (no numeric adjustment was necessary).

**Dependencies:** Tasks 2, 7, and 9.

**Files likely touched:**

- `scripts/pdq-differential.mjs`
- `__tests__/fixtures/pdq/regressions.json`
- `docs/modernization/pdq-numeric-conformance.md`
- `package.json`

**Estimated scope:** Medium.

## Checkpoint D: Public Core

- [x] Schema, codec, comparison, and policy behavior are reviewed as public contracts.
- [x] Fixed and randomized oracle conformance are exact.
- [x] `pnpm check` passes without a production WASM dependency.

## Phase 4: Prove Packaging and Real Browser Execution

### Task 11: Verify packed CJS, ESM, browser, and worker behavior

**Status:** Complete at the authoritative rebased tip `631ac3f` on 2026-08-09.

**Description:** Expand package checks from Node-imported browser ESM to real browser engines and a
Web Worker using identical raw fixture bytes.

**Acceptance criteria:**

- [x] Packed root, `/node`, `/core`, `/browser`, historical `lib` paths, and `package.json` work in
  isolated consumers with the documented module formats.
- [x] Chromium, Firefox, and WebKit produce exact hash and quality equality for the same raw vectors
  on the main thread and in a worker.
- [x] Browser graphs contain no Node built-ins, Node decoders, native addon, or unexpected WASM.

**Verification:**

- [x] `pnpm test:package`
- [x] Run the browser-engine/worker conformance command.
- [x] Test TypeScript consumers under `node16`, `nodenext`, and `bundler` resolution.

**Dependencies:** Task 10.

**Files likely touched:**

- `scripts/browser-smoke.html`
- `scripts/browser-package-smoke.mjs`
- `scripts/package-smoke.cjs`
- `.github/workflows/ci.yml`
- `package.json`

**Estimated scope:** Medium.

## Checkpoint E: Core Release Candidate

- [x] Exact PDQ is proven in supported Node and browser engines plus workers.
- [x] Legacy root and deep-import compatibility remain green.
- [x] The pure pixel API can independently ship or proceed to adapter work.

## Phase 5: Add Encoded-Image Adapters Behind a Separate Gate

The maintainer approved the following first-release adapter scope on 2026-08-09. The isolated
implementation is tracked in
[`image-preparation-adapter-plan.md`](./image-preparation-adapter-plan.md); integration and release
were integrated only after Task 11 package, browser-engine, and worker evidence was complete.

- Node: path and encoded byte inputs for static JPEG, PNG, and WebP; new URL fetching deferred.
- Browser: `ImageData`, `Blob`, and `File`; no HTML element or URL convenience APIs initially.
- Animated inputs rejected explicitly rather than hashing an implicit engine-selected frame.
- Decoder limits, EXIF orientation, ICC/color handling, alpha output, and abort behavior documented.

### Task 12: Select and freeze the Node decoder contract

**Status:** Complete on 2026-08-09; corpus-based decoder tolerance was subsequently measured in
Task 15.

**Description:** Evaluate the existing decoders against the required static formats, orientation,
color, animation detection, size limits, portability, and license constraints before changing the
new API.

**Acceptance criteria:**

- [x] A decision record names decoder versions, supported formats, EXIF/ICC/alpha behavior,
  animation policy, maximum bytes/pixels, and error categories.
- [x] Decode time and PDQ core time are measurable separately.
- [x] New URL fetching is either explicitly specified with security limits or deferred; it is not
  inherited accidentally from `imageHash()`.

**Verification:**

- [x] Run static JPEG, PNG, and WebP contract tests; retain the licensed differential corpus used
  by Task 15.
- [x] Review dependency, package-size, browser-graph, and license evidence.
- [x] Maintainer approves Sharp 0.35.3 and the shared decoder contract before Task 13.

**Dependencies:** Task 11.

**Files likely touched:**

- `docs/architecture/0003-runtime-image-decoder-contract.md`
- `benchmarks/pdq/decoder-spike.mjs`
- `benchmarks/pdq/fixtures/PROVENANCE.md`

**Estimated scope:** Medium.

### Task 13: Implement the Promise-based Node image adapter

**Status:** Complete and verified on `codex/image-preparation-adapters` on 2026-08-09.

**Description:** Add explicit `/node` encoded-image fingerprinting without changing the legacy
callback path.

**Acceptance criteria:**

- [x] `fingerprintImage()` accepts only approved Node source types and returns the same
  `PdqFingerprint` produced by the core over its normalized pixels.
- [x] Limits, unsupported formats/animation, decoding failures, and aborts use stable documented
  error categories.
- [x] No legacy `imageHash()` input, callback, decoder, error, or hash output changes.

**Verification:**

- [x] Run Node adapter tests for every approved source and error category.
- [x] Run legacy golden and callback tests in the same command.
- [x] `pnpm check`

**Dependencies:** Task 12.

**Files likely touched:**

- `src/node.ts`
- `src/node/decode-image.ts`
- `src/node/types.ts`
- `__tests__/node-fingerprint-image.test.ts`
- `package.json`

**Estimated scope:** Medium.

### Task 14: Implement the browser main-thread and worker adapter

**Status:** Complete and verified in Chromium, Firefox, and WebKit on
`codex/image-preparation-adapters` on 2026-08-09.

**Description:** Add `/browser` fingerprinting for approved decoded and encoded browser inputs while
preserving the same core identity boundary.

**Acceptance criteria:**

- [x] `ImageData` passes its tagged RGBA bytes directly to the core; `Blob`/`File` decode without
  pre-resizing and close/release temporary resources.
- [x] The approved API works in both the main thread and a worker without top-level DOM access.
- [x] Unsupported decode, dimension, animation, and abort cases are explicit and tested.

**Verification:**

- [x] Run Chromium, Firefox, and WebKit adapter tests on main thread and worker.
- [x] Scan the packed browser graph for forbidden imports and unexpected assets.
- [x] `pnpm test:package`

**Dependencies:** Tasks 11 and 12.

**Files likely touched:**

- `src/browser.ts`
- `src/browser/decode-image.ts`
- `src/browser/types.ts`
- `__tests__/browser-fingerprint-image.test.ts`

**Estimated scope:** Medium.

### Task 15: Measure encoded-image decoder tolerance

**Status:** Complete on 2026-08-09. The initial distance-10 gate holds except for one documented
Firefox Display P3 ICC/color-management exception at distance 12; all repeated decodes are exact.

**Description:** Compare each approved adapter with the pinned C++ decode path over a licensed
static-image corpus and publish the actual variance.

**Acceptance criteria:**

- [x] Same pinned decoder/configuration is exact on repeat runs.
- [x] For quality at least 80, the starting release gate is Hamming distance at most 10 from C++;
  every exception is investigated and categorized.
- [x] Reports separate format, runtime, engine, EXIF orientation, alpha, ICC/color profile, and
  decoder effects rather than averaging them together.

**Verification:**

- [x] Run the opt-in adapter differential suite and preserve its raw result artifact.
- [x] Review p50, p95, and maximum distance by category.
- [x] Confirm documentation makes no cross-decoder exact-equality promise.

**Dependencies:** Tasks 13 and 14.

**Files likely touched:**

- `benchmarks/pdq/adapter-differential.mjs`
- `benchmarks/pdq/fixtures/manifest.json`
- `docs/modernization/pdq-adapter-conformance.md`
- `package.json`

**Estimated scope:** Medium.

## Checkpoint F: Adapter Release Candidate

- [x] Node and browser adapter contracts are explicitly approved.
- [x] Decoder variance stays within the approved gate or has documented exceptions.
- [x] Legacy compatibility and pure-core conformance remain unchanged.

## Phase 6: Calibrate Performance and Matching Behavior

### Task 16: Benchmark TypeScript against same-source WASM

**Description:** Measure core-only latency, total adapter latency, memory, browser responsiveness,
and artifact size on named hardware before deciding whether an optional WASM backend is justified.

**Acceptance criteria:**

- [x] Absolute product budgets are recorded before reviewing results at approximately 0.25, 2, and
  12 megapixels.
- [x] TypeScript and WASM use identical normalized pixels; decode and hash timings are separate.
- [x] Any WASM escalation is an explicit follow-up decision, never silent runtime selection.

**Verification:**

- [x] Run warm benchmark samples and retain raw timing/memory results.
- [x] Report p50, p95, throughput, peak memory, and package/asset size.
- [x] Repeat a representative case to confirm result stability.

**Dependencies:** Tasks 10, 13, and 14.

**Files likely touched:**

- `benchmarks/pdq/core-performance.mjs`
- `benchmarks/pdq/browser-performance.html`
- `docs/modernization/pdq-performance-results.md`
- `package.json`

**Estimated scope:** Medium.

### Task 17: Calibrate the opt-in match policy on licensed product data

**Description:** Evaluate full-image and caller-produced cropped-region fingerprints on a
redistribution-safe MTG corpus without adding card detection or crop logic to this package.

**Acceptance criteria:**

- [x] Corpus labels positives, negatives, full-image pairs, crop-region pairs, transformations, and
  provenance.
- [x] Threshold sweeps report precision, recall, false positives, false negatives, and the effect of
  minimum quality around the Meta starting policy.
- [x] The library documents recommended starting values and limitations; application-specific
  thresholds remain caller-controlled.

**Verification:**

- [x] Run the benchmark command and retain raw distances/qualities.
- [x] Review hard positives, hard negatives, crop failures, and the empty low-quality population.
- [x] Confirm no crop-selection API or application policy entered the core.

**Dependencies:** Task 15; can run independently of Task 16 once adapters are stable.

**Files likely touched:**

- `benchmarks/pdq/matching-quality.mjs`
- `benchmarks/pdq/fixtures/manifest.json`
- `docs/modernization/pdq-matching-results.md`

**Estimated scope:** Medium.

## Phase 7: Release and Migration Evidence

### Task 18: Finalize API, migration, and release documentation

**Description:** Publish the exact contract, examples, compatibility statement, known limits,
threshold guidance, verification evidence, and rollback path.

**Acceptance criteria:**

- [ ] README examples cover core raw pixels, full encoded images, caller-supplied crops, parsing,
  comparison, and explicit policy without changing legacy examples.
- [ ] Release notes state decoder/runtime support, record persistence guidance, quality semantics,
  known crop/rotation/adversarial limits, and fixture/code attribution.
- [ ] Packed 7.0.1 and release-candidate compatibility results plus all accepted conformance and
  benchmark commands are recorded.

**Verification:**

- [ ] `pnpm check`
- [ ] `npm pack --dry-run`
- [ ] Fresh CommonJS, ESM, browser, and worker examples run against the packed tarball.

**Dependencies:** Tasks 15–17.

**Files likely touched:**

- `README.md`
- `docs/modernization/image-hashing-modernization-spec.md`
- `docs/modernization/pdq-reference-material.md`
- release notes or changelog selected by the maintainer

**Estimated scope:** Medium.

## Checkpoint G: Complete

- [ ] Legacy BMVB hashes and callback behavior are unchanged.
- [ ] Exact raw-pixel PDQ hash and quality conformance is proven across Node, browsers, and workers.
- [ ] Encoded-image variance, performance, memory, and matching behavior are published from evidence.
- [ ] Every fixture and ported source element has provenance and required attribution.
- [ ] The package is ready for review as an opt-in PDQ release; no default-algorithm change is bundled.

## Parallelization Opportunities

- After Task 4 freezes shared types, Tasks 5 and 6 can be developed in separate sessions if they do
  not edit the same stage-test file; otherwise keep them sequential.
- Task 8 record-codec work can proceed alongside Task 10 differential-tool preparation after Task 7.
- Tasks 13 and 14 can proceed independently after Tasks 11–12 freeze shared adapter contracts.
- Tasks 16 and 17 are independent once adapter conformance is stable.
- Package exports, shared types, `src/core/index.ts`, and CI files are coordination points; changes
  to them should be serialized and reviewed between parallel slices.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| JavaScript number semantics flip median-boundary bits | High | Oracle-first stage vectors, float32 discipline, 10,000-vector differential gate |
| PDQ changes regress the landed cross-runtime contracts | High | Keep `d4f88fa` as the baseline and rerun packed subpath and browser-graph checks at each public-contract checkpoint |
| `exports` breaks historical consumers | High | Preserve known paths and test packed 7.0.1 versus candidate consumers |
| Browser/Node decoders produce different pixels | Medium | Exactness only at normalized pixels; categorized decoder tolerance reports |
| Upstream images lack redistribution rights | High | Synthetic oracle vectors and per-fixture provenance; no blind vendoring |
| TypeScript is too slow on large scans | Medium | Predeclared budgets, workers, profiling, explicit optional WASM decision only if needed |
| PDQ misses deep or misaligned crops | Medium | Caller-owned crop regions, product benchmark, honest documented limits |
| Adapter input or fetch behavior expands security scope | Medium | New URLs deferred by default; explicit limits and separate approval if added |

## Decisions Still Needed

These do not block the completed Tasks 1–15:

- Supply or identify a redistribution-safe MTG calibration corpus before Task 17.
- Record absolute performance and responsiveness budgets before Task 16.

## Plan Approval Gate

Before implementation begins, confirm:

- [ ] Task order and phase boundaries are acceptable.
- [ ] Completed Task 1 plus Tasks 2–11 define the first implementation increment.
- [ ] Adapter work remains separately gated after the exact pixel core.
- [ ] No task is expected to change the legacy default algorithm or callback API.
