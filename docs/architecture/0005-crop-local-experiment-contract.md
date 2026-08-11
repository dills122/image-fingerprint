# ADR 0005: Crop-Local Experiment Contract

Status: proposed; internal experiment only
Updated: 2026-08-10

The grayscale experiment described here remains internal. The separately validated item-color
wrapper is available only through the unstable package subpath defined by
[ADR 0008](./0008-crop-local-experimental-package-surface.md); it is not a stable algorithm or codec
record.

## Context

The `crop-local-multiscale-binary-v0` experiment advanced beyond the failed Crop-Block and
single-scale keypoint baselines, but its first implementation left important product semantics
implicit. The comparison parameters were named `query` and `candidate` even though aligned
verification expects a complete source first and a possible crop second. The in-memory shape was
also trusted at runtime despite variable-length feature and verification data.

The expanded development study retained two false positives where crops from different generated
cards contained effectively indistinguishable template pixels. Ordinary threshold changes cannot
recover item identity when the pixels do not contain an item-specific signal.

## Proposed Decision

- Keep the experiment internal and expose no package-root algorithm, codec, or persisted record.
- Name the verifier `compareCropLocalSourceToCrop(source, crop)` and define its direction as part of
  the evidence. Retrieval may use a crop to find candidate sources, but final verification always
  restores this source-first ordering.
- Do not require or combine a reverse comparison. A second direction is not independent evidence
  and must not promote an otherwise uncertain decision.
- Retain three comparison states with these meanings:
  - `match`: enough geometric and aligned-pixel evidence says the crop is visually consistent with
    part of the source;
  - `no-match`: correspondence, geometry, or aligned content provides negative evidence;
  - `insufficient-evidence`: a plausible transform exists, but the aligned overlap lacks enough
    distinctive information for an automated decision.
- Treat `match` as a perceptual-copy signal, not proof that two records, products, cards, or other
  template-based items have the same identity.
- Treat a template-only crop as a product-level ambiguity. Callers that need item identity must add
  metadata, OCR, a more specific visual signal, or manual review; the library must not invent
  certainty from shared chrome.
- Validate every experiment fingerprint before pairwise matching or sketch decoding. The v0 bounds
  are at most 1,024 256-bit features, six fixed pyramid levels, source dimensions up to 2,048,
  verification dimensions up to 256 per side, and an exact bounded lowercase-hex sketch.
- Keep the old `compareCropLocalFingerprints` name as an internal compatibility alias while local
  benchmark callers move to the role-explicit name.

## Automated-Decision Guidance

For conservative deduplication, only `match` is positive. Both `no-match` and
`insufficient-evidence` remain non-positive, but callers should retain the distinction for metrics,
fallbacks, or review queues. An `insufficient-evidence` result must not be silently rewritten to
`no-match` in stored evaluation evidence.

The verifier cannot label every visually indistinguishable template crop as insufficient. If all
retained pixels strongly agree, the visual signal may honestly return `match`; the caller remains
responsible for deciding whether visual sameness is sufficient for its product concept of identity.

## Compatibility

- `pdq-v1`, `blockhash-v1`, public package entrypoints, and schema version 1 records are unchanged.
- The grayscale crop-local types remain reachable only through internal source/build paths used by
  repository experiments. ADR 0008 separately exposes the item-color wrapper as an unstable
  preview.
- Validation freezes only the current experiment shape. It does not approve that shape for durable
  storage or establish a migration promise.

## Remaining Gates

Before a stable crop-local proposal:

1. obtain maintainer approval for these source/crop and tri-state semantics;
2. retain the completed source-disjoint item-color holdout evidence and its frozen-policy audit;
3. measure retrieval with a realistically large reference collection;
4. meet predeclared generation-time, serialized-size, and allocation budgets;
5. expand exact browser and worker fixtures beyond one procedural image;
6. design and review a bounded persistent schema separately from this in-memory validator.

## Related Material

- [Crop-Local v0 results](../modernization/crop-local-v0-results.md)
- [Crop-Local item-color experiment](./0006-crop-local-item-color-experiment.md)
- [Crop-Local experimental package surface](./0008-crop-local-experimental-package-surface.md)
- [Crop-aware multi-fingerprint ADR](./0004-crop-block-multi-fingerprints.md)
- [Versioned fingerprint ADR](./0001-versioned-image-fingerprints.md)
