# Image Hashing Modernization Specification

Status: approved for implementation planning
Updated: 2026-08-09

## 1. Objective

Add a modern, versioned perceptual fingerprint capability while preserving the existing BMVB hash
and callback API for consumers that store or compare today's output. PDQ is the first candidate
because it has a compact 256-bit representation, a quality signal, public reference implementations,
and cross-language fixtures.

The initial outcome is a trustworthy hashing and comparison library. Semantic search, content
moderation policy, and large-scale database indexing are not part of this increment.

## 2. Approved Public Contract

New fingerprints are self-describing in typed APIs and persistent records:

```ts
type FingerprintAlgorithm = 'blockhash-v1' | 'pdq-v1';

type ImageFingerprint =
  | {
      schemaVersion: 1;
      algorithm: 'blockhash-v1';
      encoding: 'hex';
      hash: string;
      bitLength: number;
      parameters: { bitsPerSide: number; method: 1 | 2 };
    }
  | {
      schemaVersion: 1;
      algorithm: 'pdq-v1';
      encoding: 'hex';
      hash: string;
      bitLength: 256;
      quality: number;
    };

type FingerprintComparison =
  | {
      comparable: true;
      algorithm: FingerprintAlgorithm;
      distance: number;
      bitLength: number;
      normalizedDistance: number;
    }
  | {
      comparable: false;
      reason: 'algorithm-mismatch' | 'parameter-mismatch' | 'bit-length-mismatch';
    };
```

`blockhash-v1` names the current serialized BMVB behavior. `pdq-v1` would name a conformant PDQ
raw-pixel and serialization contract. Bare hash strings remain supported by the legacy API, but new
storage should retain the algorithm identifier.

Matching policy is separate from comparison. The library may export a named PDQ starting policy of
distance at most 31 and quality at least 50, but comparison never applies it silently.

## 3. Technical Stack

- TypeScript package with a shared Node.js and modern-browser algorithm core.
- pnpm for reproducible development installs.
- Vitest for unit, integration, fixture, and differential tests.
- Historical `image-hash@7` format-specific decoders remain exactly pinned behind the explicit
  Node-only `image-hash-v7` BlockHash policy. Normalized encoded-image calls use Sharp 0.35.3.
- The production target is an auditable TypeScript port. Conformance and performance tests compare
  it with a Meta-derived WASM build and credible existing packages without making them runtime
  dependencies.
- Node.js retains a CommonJS-compatible entrypoint; browsers consume an ESM entrypoint that excludes
  Node.js built-ins and decoder dependencies.

## 4. Commands

Current repository gates:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

The implementation plan should add dedicated local-only fixture/conformance and benchmark commands
so the default test suite does not depend on live remote URLs.

## 5. Project Structure

The intended boundary is:

```text
src/
  legacy/             existing BMVB behavior, compatibility-locked
  algorithms/         pure raw-pixel fingerprint implementations
  core/               cross-runtime contracts and algorithm dispatch
  decoders/           encoded bytes -> normalized pixel buffers
  inputs/             paths, URLs, buffers, and fetch concerns
  matching/           typed distance and threshold helpers
  browser.ts           browser-safe decoded-pixel entrypoint
  index.ts             public compatibility and versioned API exports
__tests__/
  compatibility/      existing API and golden BMVB outputs
  conformance/        exact PDQ raw-pixel/reference vectors
  transformations/    labeled same/different image relationships
  integration/        decoder and public-input behavior
benchmarks/            opt-in accuracy and performance harness
docs/modernization/    source evidence, specification, plan, and results
```

This is a target layout, not authorization for an unrelated mass move. Existing files should move
only when the approved implementation needs the boundary.

## 6. Engineering Conventions

- Pure algorithms accept explicit width, height, pixel format, and tightly packed pixel data; they
  do not read files, fetch URLs, or infer MIME types.
- Decoder normalization owns EXIF orientation, grayscale expansion, and color-layout conversion.
  Each algorithm profile owns the alpha/background rule that affects its fingerprint identity.
- Encoded-image reproducibility additionally requires a named decoder/normalization policy. The
  fingerprint record identifies algorithm behavior but does not identify the decoder pipeline.
- Algorithm/version identifiers are explicit in every new result and persisted example.
- No floating threshold defaults are hidden in comparison code; defaults are named and overridable.
- Hash serialization is lowercase, fixed-width, and independently testable.
- Invalid dimensions, data lengths, formats, fingerprints, and incompatible comparisons are
  distinguishable; adapter errors additionally identify input, MIME detection, and decoding.
- New code uses explicit TypeScript types and avoids implicit `any`.

## 7. Testing Strategy

### Compatibility

- Freeze all current local fixture hashes before refactoring.
- Preserve callback timing/error semantics unless a separately approved major-version change says
  otherwise.
- Replace live-network-only evidence with checked-in or generated local fixtures; keep remote-input
  tests isolated and optional.

### PDQ conformance

- Exact results for raw RGB and grayscale vectors compared with the pinned Meta C++ reference.
- Exact bit order, median tie behavior (`>` rather than `>=`), hex serialization, and quality.
- Locally generated raw vectors with expected results from the pinned Meta C++ oracle, plus
  separately licensed resize, grayscale, dihedral, and EXIF-orientation cases.
- Decoder-level tolerance evaluated separately from exact raw-pixel conformance.

### Matching quality

- Positive pairs: lossless re-encode, JPEG quality changes, resize, mild brightness/contrast,
  grayscale, small watermark/overlay, and supported orientation handling.
- Negative pairs: visually unrelated images, repeated textures, blank/low-information images, and
  near-threshold hard negatives.
- Known-limit sets: increasing crops, borders, text overlays, mirrors, and rotations.
- Report distance distributions, threshold sweeps, precision, recall, false-positive rate, and
  low-quality rejection effects.

### Performance and portability

- Measure decode time and hash-core time separately.
- Record throughput and peak memory by image size and format.
- Test every supported Node version, browser engine, and CI architecture.
- Compare TypeScript/WASM/package candidates on identical decoded pixels.

## 8. Boundaries

### Always

- Preserve the exact current BMVB output under `blockhash-v1`.
- Version algorithm and serialization behavior.
- Keep authoritative source provenance and licenses with imported fixtures or code.
- Require local, deterministic tests for release gates.
- Publish quality and threshold semantics alongside PDQ output.

### Ask before changing

- Default algorithm, public API shape, callback behavior, Node support, module format, decoder stack,
  network-input support, or persisted fingerprint schema.
- Introducing native code, WASM binaries, model weights, or a third-party PDQ runtime dependency.
- Vendoring Meta fixtures or source into the published package.

### Never

- Reinterpret existing bare BMVB strings as PDQ.
- Present perceptual hashes as cryptographic hashes or proof of content identity.
- Claim crop, rotation, semantic, or adversarial robustness not demonstrated by the benchmark.
- Select thresholds solely from one example image or an upstream default.
- Couple the algorithm core to filesystem, HTTP, or a particular encoded image format.

## 9. Success Criteria

- Existing local BMVB golden hashes and public callback behavior remain unchanged.
- PDQ raw-pixel output matches the pinned Meta reference exactly across the conformance corpus in
  Node.js and supported browsers.
- Decoder-produced hashes satisfy an agreed tolerance and are deterministic on supported platforms.
- The result includes schema version 1, a 64-character lowercase hash, `pdq-v1`, 256 bits, and
  required quality from 0 through 100.
- Hamming comparison has documented defaults and threshold-boundary tests.
- The benchmark publishes accuracy and performance evidence for every candidate and selected
  threshold.
- Runtime, module, decoder, licensing, migration, and release decisions are documented.
- A downstream consumer can dual-write/compare legacy and PDQ fingerprints without ambiguity.

## 10. Established Direction

1. Existing BMVB behavior stays available as `blockhash-v1`; PDQ launches opt-in.
2. Node.js, modern browsers, and Web Workers share one synchronous raw-pixel core.
3. Runtime decoding adapters are Promise-based while the current callback function remains intact.
4. New persisted values include record schema and algorithm versions rather than an untyped string.
5. Initial scope includes hashing and mathematical pairwise comparison, not an image database or
   nearest-neighbor index.
6. Quality below 50 and distance at most 31 are benchmark starting points, not hard-coded policy.
7. Remote URL loading remains an adapter concern, not part of the algorithm API.
8. Meta C++ at commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` is the normative
   source; the accepted unfused float32 profile makes its answers portable across native Clang,
   same-source WASM, and TypeScript. TypeScript is the production target and WASM is a comparator.
9. New Node encoded-image calls default to normalized Sharp decoding. Existing BlockHash stores can
   select `decoderMode: 'image-hash-v7'`; the callback API selects it automatically.

## 11. Remaining Release Decisions

- Which Chromium, Firefox, and WebKit versions define the initial browser adapter support matrix?
- Do existing downstream projects need an explicit stored-hash migration/dual-write helper?
- Must remote URL/request-object inputs remain first-class for new algorithms?
- What real downstream positive/negative image pairs can be used, with suitable licenses, to
  calibrate thresholds?
- What absolute performance and memory budgets trigger consideration of an optional WASM backend?

## 12. Approval Record

- Specification owner: image-fingerprint maintainer
- Approved revision/date: 2026-08-09
- Required amendments: none for pure-core implementation planning
