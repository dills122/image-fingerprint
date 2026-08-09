# PDQ Adapter Tolerance Task Plan

Goal: Complete modernization Task 15 by measuring and documenting encoded-image decoder variance
across the approved Node and browser adapters and the pinned C++ reference path.

## Phases

- [x] Audit the existing oracle, adapter APIs, fixture provenance, and Task 15 contract.
- [x] Define a versioned corpus manifest, raw result schema, and deterministic summary calculations.
- [x] Add failing contract tests for manifest validation, distance gates, and runner planning.
- [x] Implement Node, browser-engine, and pinned-reference differential collection.
- [x] Add redistribution-safe fixtures covering format, orientation, alpha, ICC/color, and repeatability.
- [x] Preserve raw results and publish p50, p95, maximum, exceptions, and limitations.
- [x] Run Node 22/24, browser, package, audit, and five-axis review gates.

## Acceptance Criteria

- The same pinned decoder/configuration is exact on repeat runs.
- Quality >= 80 uses an initial Hamming-distance gate of <= 10 from the pinned C++ result.
- Every exception is investigated and categorized.
- Reports separate format, runtime, engine, EXIF orientation, alpha, ICC/color, and decoder effects.
- Documentation makes no cross-decoder exact-equality promise.
- Every encoded fixture has explicit generation or redistribution provenance.

## Decisions

- Keep Task 15 opt-in: it must not slow the offline unit gate or require browser binaries for
  ordinary consumers.
- Define the reference pipeline as pinned `sharp@0.35.3` normalization followed by the pinned
  decoder-free C++ PDQ oracle. Compare the Node TypeScript core exactly against the same normalized
  pixels, then attribute browser-to-reference differences to decoding/normalization.
- Store derived measurements separately from source-image provenance.
- Treat decoders and browser output as untrusted boundary data and validate all result records.
- Do not add runtime dependencies solely for benchmark orchestration.

## Risks

- Meta's bundled CImg path is not a suitably pinned decoder contract; the report must not describe
  it as an independent normative encoded decoder.
- Browser color-management behavior may be platform-dependent even within the same engine version.
- A tiny synthetic-only corpus could prove mechanics while failing to represent real decoder
  variance; fixture categories and limitations must remain explicit.
