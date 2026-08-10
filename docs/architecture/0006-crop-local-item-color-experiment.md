# ADR 0006: Crop-Local Item-Color Experiment

Status: proposed; internal quality-confirmed candidate only
Updated: 2026-08-10

## Context

The first independent `crop-local-multiscale-binary-v0` calibration failed because 1,404 genuine
same-template screenshot and card pairs passed grayscale geometry and aligned-content verification.
The false positives were not distributed across ordinary photographs or documents; they were
concentrated in shared application chrome and card layouts, especially when both items received the
same asymmetric crop.

Color is an item-specific visual signal present in many of these hard negatives and in card artwork,
but discarded by the grayscale Crop-Local v0 fingerprint. Threshold changes to the existing
grayscale verifier cannot recover information that was never retained.

## Proposed Decision

- Keep `crop-local-multiscale-binary-v0` unchanged and wrap it in a distinct internal experimental
  profile named `crop-local-item-color-v0`.
- Retain two compact, deterministic YCbCr chroma planes at a maximum dimension of 64 pixels. Do not
  change the existing grayscale descriptors or verification sketch.
- Run the existing directional source-to-crop comparison first. Aligned color is a veto only after
  the existing local evidence returns `match`; it cannot promote a local `no-match` or
  `insufficient-evidence` decision.
- Mark color as `inconclusive` when the aligned overlap has too little saturation or spatial
  coverage. Inconclusive color does not reverse the underlying local match.
- Freeze the development-selected policy at saturation 12, agreement distance 16, contradiction
  distance 48, at least 2% informative coverage across two zones, at least 60% agreement, and at
  most 10% contradiction.
- Keep the profile, types, comparator, and policy outside every public package entrypoint and
  persisted schema until a fresh untouched holdout confirms the result.

## Evidence And Limits

On the now-inspected 500-source corpus, the wrapper rechecked all 1,500 positives and all 1,405
baseline false positives. It retained all 605 baseline true positives while reducing false
positives to 25: 40.3% recall, 96.0% precision, and a 0.0173% represented false-positive rate.
This is development selection, not independent validation.

The frozen policy was then evaluated once on a new 500-source holdout that excluded all three prior
corpora and replaced the generated style-3 templates with a different style-4 family. Without any
threshold changes it produced 745/1,500 true positives and 5/144,550 reported false positives:
49.7% recall, 99.3% precision, and a 0.00346% false-positive rate. All five domains exceeded 10%
recall; card layouts reached 15%. Screenshot and card-layout hard negatives had zero false
positives. The predeclared independent quality gate passed.

A manual audit found that two reported pairs are alternate scans/crops of the same source image: a
marine artwork and a historical skiing portrait. The remaining three reported pairs are different
portraits sharing a large digitized calibration strip and studio-card structure. They remain valid
shared-template false positives in the conservative reported count.

The signal does not establish item identity for grayscale, weakly saturated, or similarly colored
templates. Eight card-layout and 17 screenshot pairs survived. Card-layout recall also remains only
0.7% because color cannot repair an earlier geometry failure. A future result must report those
limitations rather than describing color as a general identity proof.

The enriched serialized fingerprint measured 46,185 bytes at p50 and 55,266 bytes at p95, compared
with 34,716 and 39,442 bytes for the grayscale baseline. Comparison p50/p95 increased to 4.10/12.72
ms for the rechecked pairs. These remain research costs, not approved public budgets.

One nontrivial RGBA fixture produced byte-for-byte identical enriched fingerprints in Node,
Chromium, Firefox, and WebKit on both main-thread and module-worker paths. Broader exactness fixtures
remain a separate public-profile gate.

## Compatibility

- `pdq-v1`, `blockhash-v1`, package entrypoints, and schema version 1 records are unchanged.
- `crop-local-multiscale-binary-v0` remains callable as the exact grayscale experiment used by the
  earlier reports.
- `crop-local-item-color-v0` has no persisted compatibility promise and must receive a new identifier
  if its fingerprint fields or frozen comparison policy change after independent confirmation.

## Remaining Gates

1. Record maintainer approval for the wrapper semantics and decide whether 15% card-layout recall
   is sufficient for any claimed MTG use case.
2. Address serialized size, generation cost, retrieval scale, and broader browser exactness only
   after the quality gate passes independently.
3. Design and review a bounded persisted schema separately from the accepted in-memory shape.

## Related Material

- [Crop-Local v0 results](../modernization/crop-local-v0-results.md)
- [Crop-Local experiment contract](./0005-crop-local-experiment-contract.md)
- [Versioned fingerprint ADR](./0001-versioned-image-fingerprints.md)
