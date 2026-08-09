# Image Hashing Modernization Plan

Status: Tasks 1–7 and portability hardening complete locally; Tasks 8–11 awaiting authorization
Task ID: `image-hashing-modernization`
Updated: 2026-08-09

## Goal

Define a compatibility-safe path from the package's legacy Block Mean Value hash toward a modern,
versioned image-fingerprinting API, using PDQ as the first candidate and measured behavior as the
decision mechanism.

## Working Rules

- Preserve the current `imageHash` API and exact BMVB output until an approved migration says
  otherwise.
- Separate encoded-image loading and decoding from raw-pixel hashing.
- Treat algorithm identifier, serialized hash, quality, and matching threshold as public contracts.
- Do not implement the new algorithm before the detailed implementation plan is reviewed.
- Prefer authoritative source code and fixtures over third-party package descriptions.

## Phases

### 0. Integrate AI Central — complete

- [x] Select `base` and `javascript-typescript` profiles.
- [x] Select `core`, `planning`, and `workflow` skill bundles.
- [x] Add a reproducible link-mode setup wrapper.
- [x] Add repository-specific agent and quality guidance.
- [x] Record the reviewed AI Central revision.

### 1. Specify — complete

- [x] Inspect the current API, implementation boundaries, tests, and package metadata.
- [x] Identify authoritative PDQ algorithm, implementation, fixture, and threshold references.
- [x] Record the reference hierarchy and conformance expectations.
- [x] Draft product/API/testing boundaries and success criteria.
- [x] Obtain initial human review of scope and architecture direction.
- [x] Confirm PDQ as an opt-in, separately named API rather than a change to `imageHash`.
- [x] Confirm a TypeScript production core targeting Node.js, browsers, and Web Workers.
- [x] Confirm Meta C++ as the normative oracle and same-source WASM as a differential and
  performance goalpost.
- [x] Resolve the remaining contract research questions below.
- [x] Amend and approve the specification and ADR.

### 2. Contract Research — complete

- [x] Define the complete `pdq-v1` normalized-pixel contract, including formats, packing, alpha,
  color-space assumptions, orientation boundary, validation, and minimum dimensions.
- [x] Define fingerprint record versioning, canonical serialization, parsing, comparison, and
  explicit match-policy semantics.
- [x] Select a compatibility-safe package-entry strategy for `image-hash/core`,
  `image-hash/node`, and `image-hash/browser` without changing the legacy root contract.
- [x] Define exact cross-runtime guarantees and encoded-image decoder tolerance for Node,
  browser main-thread, and worker adapters.
- [x] Freeze the Meta reference/oracle procedure, licensing notices, and fixture-provenance rules.
- [ ] Define the first-release Node and browser input/decoder scope, including whether new URL
  loading is included or deferred.

Exit: research and core contracts are approved. Adapter scope is a P1 release decision and does not
block pure-core implementation planning.

### 3. Plan — complete

- [x] Turn the approved specification into a dependency and architecture plan.
- [x] Define the TypeScript port and its C++/WASM differential-test harness.
- [x] Define decoder normalization, runtime targets, and packaging strategy.
- [x] Define migration and rollout stages.

### 4. Tasks — complete; pending plan approval

- [x] Produce implementation-sized tasks with verification commands and ownership boundaries.
- [x] Identify which tasks can run independently.

### 5. Implement — in progress by approved task

- [x] Verify the landed cross-runtime foundation at fresh-main baseline `d4f88fa`.
- [x] Task 2: add and verify the pinned local C++ oracle harness.
- [x] Task 3: generate and verify the redistribution-safe synthetic conformance corpus.
- [x] Task 4: generalize and validate the tagged pixel contract.
- [x] Task 5: implement reference-compatible luminance, Jarosz downsample, and quality stages.
- [x] Task 6: implement reference-compatible DCT, Torben median, and canonical hash bits.
- [x] Repair canonical oracle CI on Linux arm64 and compare both raw and stage corpora.
- [x] Freeze the DCT matrix as exact float32 bits and remove runtime transcendental math.
- [x] Build a same-source WASM differential and decide the final portable `pdq-v1` arithmetic profile.
- [x] Task 7: compose and expose the runtime-neutral `pdq-v1` raw-pixel dispatch.
- [ ] Lock legacy contracts and baseline benchmarks.
- [ ] Implement the selected raw-pixel PDQ core/adapter.
- [ ] Add decoder adapters and public versioned API.
- [ ] Run conformance, metamorphic, performance, and compatibility tests.
- [ ] Document migration and release policy.

## Review Gate

No PDQ production implementation work should begin until the task sequence in
`docs/modernization/implementation-plan.md` is approved or amended by a maintainer.

Tasks 1–6 are complete. The maintainer authorized a portability-hardening checkpoint after the
first GitHub x64 oracle job exposed architecture-sensitive native answers. That checkpoint repairs
canonical arm64 CI, freezes numeric constants, and evaluates same-source WASM before Task 7 public
dispatch. That checkpoint is complete with an accepted portable unfused profile and hosted Linux
  arm64 confirmation. The maintainer authorized Task 7 on 2026-08-09, and its reviewed local
  implementation is complete; Tasks 8–11 still require a separate implementation decision, and
  encoded-image adapters remain gated at Task 12.

## Current Decisions

- The legacy `imageHash()` callback API and serialized BMVB results remain compatibility-locked.
- New APIs are opt-in and separate from `imageHash()`.
- `image-hash/core` is synchronous, stateless, decoder-free TypeScript shared by Node.js,
  browsers, and Web Workers.
- `image-hash/node` and `image-hash/browser` provide asynchronous environment-specific loading and
  decoding adapters.
- Exact conformance is defined at the normalized-pixel boundary; separately decoded encoded images
  are evaluated with documented tolerance rather than promised byte-for-byte equality.
- Meta's pinned C++ implementation is the normative source. `pdq-v1` freezes its coefficients and
  unfused float32 operation boundaries; a WASM build from the same source is a differential and
  performance oracle, while third-party WASM packages are secondary comparators.
- Hamming distance is mathematical output. Match thresholds and minimum quality are explicit policy,
  not hidden generic defaults.
- The existing package root remains CommonJS-compatible and does not select different behavior by
  runtime.
- The accepted package strategy explicitly exports `/core`, `/node`, and `/browser` while preserving
  the historical root, `lib` paths, and `package.json`; packed-artifact tests are mandatory.
- PDQ quality is required, dimensions are at least 5 by 5, and canonical text is 64 lowercase hex
  characters.
- Tightly packed `rgba8` inputs are composited over white with the frozen integer rounding rule
  before PDQ luminance conversion; `gray8` and `rgb8` are also accepted.
- Fingerprint record schema 1 uses `bitLength`, canonical hex, and mandatory PDQ quality, with
  incompatible comparisons represented separately from non-matches.
