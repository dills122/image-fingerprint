# ADR 0008: Crop-Local Experimental Package Surface

Status: accepted for an explicit pre-stable preview
Updated: 2026-08-10

## Context

The frozen `crop-local-item-color-v0` profile passed its independent 500-source quality gate and
its exact packed transport reproduces the verbose values and comparison decisions. It is useful
enough for application pilots, but it does not meet the compatibility, retrieval-scale, corpus,
and product-specific evidence required for a stable fingerprint algorithm.

Keeping all code source-internal prevents real application feedback. Adding Crop-Local to the
stable `ImageFingerprint` dispatcher or codec would make a stronger schema and compatibility
promise than the evidence supports. The package therefore needs a boundary that permits deliberate
testing without changing existing APIs or implying production readiness.

## Decision

- Add one explicit opt-in subpath: `image-fingerprint/experimental/crop-local`.
- Expose only the independently validated item-color path:
  - `fingerprintCropLocalItem()` and `compareCropLocalSourceToCrop()` for verbose values;
  - `fingerprintCropLocalItemPacked()` and `comparePackedCropLocalSourceToCrop()` for compact
    transport; and
  - explicit pack, unpack, validation, evidence, option, and policy types needed to use those paths.
- Preserve the source-first, possible-crop-second direction and the `match`, `no-match`, and
  `insufficient-evidence` states. Do not collapse insufficient evidence into a negative decision.
- Accept only decoded `rgba8` pixel sources. Encoded-image loading remains in the existing Node and
  browser adapters, keeping the algorithm independent of files, URLs, and decoder policy.
- Keep Crop-Local out of `ImageFingerprint`, `FingerprintAlgorithm`, `fingerprintPixels()`,
  `fingerprintImage()`, `parseFingerprint()`, `serializeFingerprint()`, and every stable root,
  Node, browser, and core export.
- Make no cross-release compatibility promise for experimental function names, TypeScript types,
  verbose fields, profile identifiers, defaults, thresholds, or the packed representation. A
  caller that stores preview values must store the experimental profile and package version and be
  prepared to regenerate or migrate them.
- Keep the 500-reference descriptor index benchmark-only. It is not a public retrieval contract.
- Keep `crop-local-card-recall-v0-development` source-internal. Its untouched MTG holdout failed the
  predeclared normalized-capture floor and is not part of this preview.

The package-subpath import is the experimental opt-in. There is no runtime global flag and no
automatic selection from a stable API.

## Evidence Supporting The Preview

The frozen item-color policy was evaluated once, without holdout tuning, on a source-disjoint
500-source corpus. It produced 745/1,500 true positives and 5/144,550 reported false positives:
49.7% recall, 99.3% precision, and a 0.00346% represented false-positive rate. Every measured domain
exceeded 10% recall, while screenshot and card-layout hard negatives had zero false positives.

The compact transport reconstructed the exact verbose values and retained exact comparison
decisions. On the procedural performance fixture it reduced serialized p50/p95 size from
49,940/56,284 bytes to 25,365/29,589 bytes. The verbose and packed values matched Node exactly in
Chromium, Firefox, and WebKit on the existing main-thread and module-worker fixture.

These results support a bounded preview, not a general production claim. The exact-runtime corpus
contains one procedural image, holdout recall remains 49.7%, and visual agreement cannot prove item
identity when distinct items share pixels or templates.

## Compatibility And Release Policy

- Existing `blockhash-v1`, `pdq-v1`, schema-version-1 records, decoder modes, stable package
  entrypoints, and historical hash behavior are unchanged.
- Patch and prerelease versions may change or remove the experimental API. The changelog and release
  notes must call out every experimental shape or policy change.
- A future stable Crop-Local proposal requires a new reviewed schema and algorithm identifier; the
  preview does not reserve either one.
- Promoting any retrieval API requires a larger selective-index evaluation with update, deletion,
  memory, latency, and multi-match semantics.
- Promoting the MTG fallback requires a changed preprocessing or matching proposal selected on new
  development data and evaluated on another untouched, source-disjoint capture corpus.

## Verification

The package gate must prove that CommonJS, ESM, and TypeScript consumers can resolve the explicit
subpath; the browser build contains no Node-only imports; verbose and packed values round-trip; and
the stable entrypoints do not expose Crop-Local symbols.

## Related Material

- [Crop-Local item-color experiment](./0006-crop-local-item-color-experiment.md)
- [Crop-Local experiment contract](./0005-crop-local-experiment-contract.md)
- [MTG card-recall development fallback](./0007-crop-local-card-recall-development.md)
- [Crop-Local retained results](../modernization/crop-local-v0-results.md)
- [Crop-Local retrieval results](../modernization/crop-local-item-color-retrieval-results.md)
