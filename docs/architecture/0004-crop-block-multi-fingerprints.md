# ADR 0004: Crop-Aware Multi-Fingerprints

Status: proposed; blocked by failed mixed-domain confirmation
Updated: 2026-08-09

## Context

`blockhash-v1` and `pdq-v1` describe one complete image with one fixed-length hash. Cropping can
remove or move enough of that image to make either global descriptor unsuitable. Published
crop-resistant work addresses this by segmenting an image and hashing the surviving regions.

Automatic segmentation changes two accepted boundaries. ADR 0001 models fingerprints as one hash,
and the PDQ plan leaves crop selection to callers. A region collection also has no honest single
Hamming distance: comparison is a set-matching operation with direction and policy.

## Proposed Decision

- Permit deterministic, algorithm-owned segmentation in a future opt-in crop-aware profile.
- Model its output as a bounded, canonically ordered collection of region fingerprints, never as
  concatenated hash text.
- Keep segmentation, child hashing, comparison evidence, and match policy separate.
- Define the first candidate as a library-owned profile inspired by Steinebach, Liu, and Yannikos;
  do not claim compatibility with the paper authors or Python ImageHash.
- Fix the initial child profile to exact `blockhash-v1` with `bitsPerSide: 16` and `method: 2`.
- Keep crop-aware comparison in algorithm-specific functions. Do not expand
  `compareFingerprints()` until a persistent schema and evidence shape are approved.
- Keep all candidate implementations internal until a transformation benchmark selects the
  preprocessing, segment cap, fallback behavior, and matching strategy.
- Treat schema version 1 support for a record without top-level `hash` and `bitLength` as unresolved.
  Public codec work requires an accepted amendment to this ADR.

## Candidate Contract

The experiment uses already-oriented, tightly packed `rgba8` input. A candidate result records the
preprocessing profile and a bounded list of bright, dark, or fallback regions. Each region carries
its segmentation-grid area, half-open grid box, mapped source box, and 256-bit BlockHash value.

Comparison constructs the full bounded pairwise Hamming matrix and evaluates directed nearest,
mutual-nearest, and one-to-one maximum-cardinality/minimum-distance strategies. Evidence retains
matched pairs and both coverage directions. A later policy may decide eligibility and matching;
generation does not hide a threshold.

## Compatibility

- The legacy callback API, BlockHash bytes, PDQ bytes/quality, package entrypoints, and current
  fingerprint codec remain unchanged during the experiment.
- Exact crop-core determinism begins at identical normalized RGBA bytes. Decoder variance remains
  governed by ADR 0003.
- A behavior-changing preprocessing, segmentation, child-hash, ordering, or serialization change
  requires a new algorithm identifier after a profile is frozen.

## Risks

- Threshold-boundary changes can split or merge regions and change most of the result.
- Generic or fallback regions can create false positives, particularly if target reuse is allowed.
- Segment count and pairwise comparison must be bounded for untrusted input.
- The profile is not rotation-, perspective-, semantic-, cryptographic-, or adversarially robust.
- Region boxes can expose structural metadata and make persisted records substantially larger than
  a fixed hash.

## Approval Gate

Accept this ADR only after the experiment report identifies a deterministic profile with a material
crop-recall benefit over full-image BlockHash and PDQ, acceptable unrelated-image false positives,
bounded output/runtime, cross-runtime equality on identical pixels, and reviewed provenance.

Until then, `crop-block-v1` is a reserved candidate name and is not a public algorithm.

The 2026-08-09 mixed-domain confirmation did not satisfy this gate: the candidate's predeclared
distance-64 policy produced an 8.19% false-positive rate against a 0.5% maximum. Exact child-hash
matches and stricter diagnostic policies showed repeated generic regions, so threshold tuning is
not sufficient. This ADR must not be accepted without a redesigned candidate and a new independent
confirmation study.
