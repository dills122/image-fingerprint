# Image Hashing Modernization Specification

Status: draft for maintainer review — not approved
Updated: 2026-08-07

## 1. Objective

Add a modern, versioned perceptual fingerprint capability while preserving the existing BMVB hash
and callback API for consumers that store or compare today's output. PDQ is the first candidate
because it has a compact 256-bit representation, a quality signal, public reference implementations,
and cross-language fixtures.

The initial outcome is a trustworthy hashing and comparison library. Semantic search, content
moderation policy, and large-scale database indexing are not part of this increment.

## 2. Proposed Public Contract

The exact naming remains subject to review, but new fingerprints should be self-describing in typed
APIs and persistent records:

```ts
type FingerprintAlgorithm = 'blockhash-v1' | 'pdq-v1';

interface ImageFingerprint {
  algorithm: FingerprintAlgorithm;
  hash: string;
  bits: 256;
  quality?: number;
}

interface MatchResult {
  algorithm: FingerprintAlgorithm;
  distance: number;
  threshold: number;
  matches: boolean;
}
```

`blockhash-v1` names the current serialized BMVB behavior. `pdq-v1` would name a conformant PDQ
raw-pixel and serialization contract. Bare hash strings remain supported by the legacy API, but new
storage should retain the algorithm identifier.

## 3. Technical Stack

- TypeScript package for Node.js.
- pnpm for reproducible development installs.
- Vitest for unit, integration, fixture, and differential tests.
- Existing format-specific decoders remain in place for the legacy path during evaluation.
- A PDQ implementation dependency or WASM binary is not yet approved; the spike must compare an
  auditable TypeScript port, a Meta-derived WASM build, and credible existing packages.
- Target runtime and module format remain open decisions. The existing dependency graph already
  requires a modern Node version, which must become explicit.

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
  decoders/           encoded bytes -> normalized pixel buffers
  inputs/             paths, URLs, buffers, and fetch concerns
  matching/           typed distance and threshold helpers
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

- Pure algorithms accept explicit width, height, channel/layout, and pixel data; they do not read
  files, fetch URLs, or infer MIME types.
- Decoder normalization owns EXIF orientation, alpha/background policy, grayscale expansion, and
  color-layout conversion.
- Algorithm/version identifiers are explicit in every new result and persisted example.
- No floating threshold defaults are hidden in comparison code; defaults are named and overridable.
- Hash serialization is lowercase, fixed-width, and independently testable.
- Errors identify the failed boundary: input, MIME detection, decoding, hashing, or comparison.
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
- Meta regression fixtures including resize, grayscale, dihedral, and EXIF-orientation cases.
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
- Test every supported Node version and CI architecture.
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
- PDQ raw-pixel output matches the pinned Meta reference exactly across the conformance corpus.
- Decoder-produced hashes satisfy an agreed tolerance and are deterministic on supported platforms.
- The result includes a 64-character lowercase hash, `pdq-v1`, 256 bits, and quality from 0 through
  100.
- Hamming comparison has documented defaults and threshold-boundary tests.
- The benchmark publishes accuracy and performance evidence for every candidate and selected
  threshold.
- Runtime, module, decoder, licensing, migration, and release decisions are documented.
- A downstream consumer can dual-write/compare legacy and PDQ fingerprints without ambiguity.

## 10. Initial Assumptions Requiring Review

1. Existing BMVB behavior stays available indefinitely as `blockhash-v1`; PDQ launches opt-in.
2. The first supported PDQ environment is Node.js; a raw-pixel core remains browser-portable.
3. The new API may be Promise-first while the current callback function remains intact.
4. New persisted values include the algorithm identifier rather than storing an untyped hex string.
5. Initial scope includes hashing and pairwise comparison, not an image database or nearest-neighbor
   index.
6. Quality below 50 and distance at most 31 are benchmark starting points, not hard-coded policy.
7. Remote URL loading remains a compatibility adapter, not part of the algorithm API.

## 11. Open Decisions

- Is browser support a first release requirement or a later packaging target?
- Which Node versions and CJS/ESM combinations must be supported?
- Should the new versioned API be Promise-only, dual Promise/callback, or callback-compatible?
- Do existing downstream projects need an explicit stored-hash migration/dual-write helper?
- Must remote URL/request-object inputs remain first-class for new algorithms?
- Is `pdq-v1` intended to become the default after a deprecation period, or stay opt-in?
- What real downstream positive/negative image pairs can be used, with suitable licenses, to
  calibrate thresholds?
- Are deep crops, large overlays, or semantic similarity requirements for this package? If yes,
  PDQ alone is insufficient and a second algorithm track is required.

## 12. Approval Record

- Specification owner: pending
- Approved revision/date: pending
- Required amendments: pending
