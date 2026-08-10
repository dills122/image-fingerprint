# Crop-Local v0 Oracle Results

Status: internal experiment remains useful; public profile blocked by independent calibration
Updated: 2026-08-10
Baseline: `a93b564e18e4121d28dfe2e5661e83d110ac2bde`

## Decision

Continue the internal pure-TypeScript `crop-local-v0` experiment. Do not export an algorithm,
freeze a persisted schema, or add OpenCV to package dependencies.

Pinned AKAZE and SIFT research oracles confirm the missing signal in the earlier experiments:
multiscale local features recover correspondences before scale estimation, and transform-aligned
content verification separates real crops from repeated templates. The locked AKAZE policy passed
on a new source-disjoint corpus without threshold reselection.

This is a go decision for another implementation experiment, not a production accuracy claim. The
source-disjoint study has only 3,675 negatives; zero observed false positives still has a nonzero
confidence bound. The current verifier also performs multiple full-resolution OpenCV warps and is
too expensive and runtime-specific to become the portable library implementation.

## Oracle Design

The research-only Python harness pins Python 3.12, OpenCV 4.12.0.88, and NumPy 2.2.6 through PEP
723 metadata. It evaluates:

1. spatially balanced AKAZE M-LDB or SIFT features, capped at 384 per image;
2. absolute distance, ratio, mutual-nearest, and within-image burstiness policies;
3. deterministic uniform-scale/translation hypothesis enumeration and refinement;
4. multiple retained transforms with spatially distributed support;
5. shared-coordinate luminance, gradient, and census-style verification;
6. explicit informative coverage, agreement, contradiction, and insufficient-evidence signals.

AKAZE and SIFT are performance/quality oracles only. `crop-local-v0` does not claim compatibility
with either implementation.

## Development Selection

The already-inspected 50-source mixed corpus remained development data. It contains 150 crops and
3,675 unrelated pairs across photographs, portraits, documents, screenshots, and card layouts.

| Oracle and stage | Positive recall | Negative rate | Gate |
| --- | ---: | ---: | --- |
| AKAZE correspondence | 87.3% | 9.88% candidate rate | pass |
| AKAZE geometry | 77.3% | 2.99% consensus rate | pass |
| AKAZE aligned verification | 69.3% | 0.027% false-positive rate | pass |
| SIFT correspondence | 99.3% | 14.26% candidate rate | pass |
| SIFT geometry | 97.3% | 4.03% consensus rate | **fail** |
| SIFT aligned verification | 86.7% | 0.027% false-positive rate | pass |

The SIFT upper bound is stronger, but its selected standalone geometry point missed the predeclared
3% negative-consensus gate. AKAZE advanced because it cleared all three gates, uses binary
descriptors, and is closer to the intended bounded browser-capable implementation.

The selected AKAZE verifier requires at least 5% informative overlap, 95% aligned agreement, no more
than 2% strong contradiction, and evidence in at least three spatial zones. Earlier 80% agreement
profiles could not distinguish sparse same-template layouts. The higher agreement frontier was
selected on development data and then locked before the source-disjoint run.

## Locked Source-Disjoint Evaluation

A new local-only corpus excluded every prior Commons page ID, started from a later Commons search
offset, and used a new style-2 synthetic screenshot/card generator with a separate seed range. It
contains another 50 sources, 150 crop positives, and 3,675 negatives. Public Domain/CC0 source
metadata and SHA-256 checksums are embedded in the retained result; pixels remain outside the
repository.

The locked AKAZE policy produced:

- correspondence: 147/150 positives (98.0% coverage);
- geometry: 142/150 positives (94.7% recall) and 107/3,675 negative consensuses (2.91%);
- final verification: 119 true positives, 31 false negatives, zero false positives, and 3,675 true
  negatives;
- final recall 79.3%, observed false-positive rate 0%, and precision 100% on this study;
- one positive and no negatives classified as insufficient evidence at the selected information
  policy.

Per-domain final recall was:

| Domain | TP / positives | Recall |
| --- | ---: | ---: |
| Photograph | 30 / 30 | 100.0% |
| Portrait | 29 / 30 | 96.7% |
| Document | 29 / 30 | 96.7% |
| Screenshot | 23 / 30 | 76.7% |
| Card layout | 8 / 30 | 26.7% |

All five domains exceeded the 10% guardrail. Same-template screenshot and card-layout negatives had
zero final false positives despite high candidate and geometric-consensus rates, confirming that
aligned content verification—not geometry alone—is the decisive stage.

## Resource Evidence And Remaining Work

On macOS arm64 with the pinned oracle environment, the locked run measured:

- generation p50/p95: 23.84/35.82 ms per variant;
- descriptor matching p50/p95: 0.444/0.844 ms per pair;
- geometry p50/p95: 0.0004/4.83 ms per pair;
- each evaluated aligned warp p50/p95: 24.09/85.34 ms;
- retained feature count p50/p95: 276/384.

Multiple transform hypotheses caused 1,891 aligned verifications. The pure-TypeScript experiment
replaces these full-resolution operations with a compact, deterministic sketch and bounded policy.

## Pure-TypeScript Prototype

The internal `crop-local-multiscale-binary-v0` prototype implements six fixed pyramid levels,
spatially balanced FAST-like corners, deterministic orientation, a seeded rotated 256-bit binary
descriptor, mutual/ratio matching, within-image repetition weighting, uniform-scale/translation
geometry, and a 96-pixel-maximum raw-luminance verification sketch. Local luminance, gradient, and
census planes are computed only after the candidate sketch is aligned to the source coordinates.

No root entrypoint exports this code. The experiment retains up to 128 features in the benchmark
profile and returns `match`, `no-match`, or `insufficient-evidence` with stage evidence and reasons.
The comparison direction is currently source first and crop candidate second; indexed lookup can
retrieve a source from a crop query and then invoke verification in that order. Symmetric product
semantics remain unspecified.

On the already-inspected development corpus, the selected TypeScript policy produced:

| Stage | Recall | Negative rate | Gate |
| --- | ---: | ---: | --- |
| Correspondence | 86.7% | 14.29% candidate rate | pass |
| Geometry | 42.7% | 2.69% consensus rate | pass |
| Aligned verification | 42.0% | 0% false-positive rate | pass |

The geometry policy requires four inliers, a 50% inlier ratio, and four spatial zones. Dense
verification requires 2% informative overlap, three informative zones, 65% agreement, and no more
than 20% strong contradiction. Sparse overlap requires 80% agreement and zero observed strong
contradictions. Those policies were frozen before the source-disjoint TypeScript run.

The frozen TypeScript policy then produced 86/150 true positives and zero false positives among
3,675 unrelated pairs: 57.3% recall and 0% observed false-positive rate. Geometry alone reached
64.0% recall at a 1.41% negative-consensus rate. Per-domain final recall was:

| Domain | TP / positives | Recall |
| --- | ---: | ---: |
| Photograph | 24 / 30 | 80.0% |
| Portrait | 15 / 30 | 50.0% |
| Document | 23 / 30 | 76.7% |
| Screenshot | 24 / 30 | 80.0% |
| Card layout | 0 / 30 | 0% |

The four-of-five domain guardrail passed, but card layouts remain a clear limitation. The
conservative result is preferable to confusing shared card chrome with identity: the aligned
verifier rejected every unrelated card, while the local-feature geometry also rejected every true
card crop. This domain needs a stronger item-specific signal rather than looser thresholds.

The original implementation's generation p50/p95 was 201.28/469.70 ms per fingerprint on the
50-source locked corpus. Serialized fingerprints measured 34,964/39,264 bytes at p50/p95. These
were research measurements, not an accepted runtime or storage budget.

## Expanded Locked Development Study

The two 50-source corpora were combined without changing the frozen policy. Five variant pairings
per unrelated source pair produced 24,750 hard negatives, exceeding the development-negative target,
plus 300 crop positives. The extra variant pairings are correlated, and both constituent corpora had
already been used elsewhere in the research; this is a larger development stress test, not a final
independent calibration set.

The frozen TypeScript policy produced:

- 149 true positives and 151 false negatives: 49.7% recall;
- 2 false positives and 24,748 true negatives: 0.0081% observed false-positive rate;
- 98.7% precision;
- 53.3% geometry recall at a 0.94% negative-consensus rate;
- unchanged four-of-five domain coverage, with 73.3% photograph, 60.0% portrait, 55.0% document,
  60.0% screenshot, and 0% card-layout recall.

Every non-card negative domain pair remained clean. Both false positives were asymmetric crops from
the style-1 card generator: item 5 versus items 7 and 9. They had 46–47 geometric inliers, 13
informative zones, 99.5–99.7% aligned agreement, and zero measured contradictions. This is a concrete
template-ambiguity failure: the cropped pixels retained by those fixtures are effectively
indistinguishable under the current visual signal. The pairs are retained as regression evidence;
loosening or slightly tightening ordinary thresholds is not an appropriate fix.

An exact-output optimization then precomputed fixed-point resize axes and rotated descriptor samples,
removed per-pixel FAST allocations, and used equivalent horizontal/vertical sums for the 3×3 blur.
The full procedural fingerprint SHA-256 remained
`17eb4f5f737fd5a0da665e87acff843c925001b1509ebf782921754b58bea95e`, and all aggregate quality
counts were unchanged. On the same 400 generated fingerprints:

| Generation timing | Before | After | Improvement |
| --- | ---: | ---: | ---: |
| p50 | 189.80 ms | 113.17 ms | 40.4% |
| p95 | 434.67 ms | 273.90 ms | 37.0% |

Locked comparison p50/p95 was 1.42/1.68 ms in the optimized expanded run. Fingerprint size did not
change and remains a separate optimization target.

## Runtime Exactness And Retrieval Pilot

A procedural nontrivial RGBA fixture produced exact fingerprint equality against Node.js 22.22.1
in Chromium 151, Firefox 153, and WebKit 26.5, on both the main thread and a module worker. This is
an encouraging deterministic fixture, not yet a diverse conformance corpus.

The 50-reference retrieval pilot split every descriptor into position-tagged substrings. It tested
raw occurrence voting, within-image deduplication, IDF weighting, and document-frequency stop
features. On the 63 crop queries accepted by the full verifier:

| Retrieval profile | recall@1 | recall@10 | recall@200 |
| --- | ---: | ---: | ---: |
| Raw 8-bit votes | 9.5% | 52.4% | 100% |
| Burst-suppressed 8-bit votes | 54.0% | 92.1% | 100% |
| IDF 16-bit substrings | 95.2% | 100% | 100% |
| IDF 16-bit, stop features above 20% DF | 98.4% | 100% | 100% |

Within-image burst suppression materially helped. Moderate corpus-frequency suppression improved
the 16-bit profile slightly, while aggressive suppression of common 8-bit tokens reduced recall.
The candidate recall@200 pilot gate passed, but a 50-reference index is much too small to predict
million-scale selectivity, memory, or latency.

## Independent Calibration

A source-disjoint calibration corpus was built without changing the frozen fingerprint,
geometry, or verification policy. It contains 500 sources—100 each for photographs, portraits,
documents, screenshots, and card layouts—and three deterministic crops per source for 1,500
positive transformations. The 300 Commons sources exclude both development corpora by page ID and
pixel SHA-256; the 200 generated sources use a new style-3 screenshot/card generator and a separate
seed range. Source pixels remain local-only.

The calibration evaluated all 124,750 unrelated original pairs plus 19,800 asymmetric
same-template screenshot and card-layout hard negatives. This produced 144,550 negatives and one
locked policy evaluation; no thresholds were swept or reselected.

The frozen TypeScript policy produced:

- 605 true positives and 895 false negatives: 40.3% recall;
- 1,405 reported false positives and 143,145 true negatives: 0.972% observed false-positive rate;
- 30.1% precision under this deliberately template-heavy negative population;
- 50.2% geometry recall at a 3.82% negative-consensus rate;
- 65.7% photograph, 57.0% portrait, 13.0% document, 65.3% screenshot, and 0.7% card-layout recall.

The final false-positive rate exceeded the predeclared 0.5% maximum, and the geometry stage exceeded
its 3% maximum. The independent gate therefore failed. Card layouts also remained below the 10%
domain guardrail. This result blocks a public crop-local profile and must not be repaired by tuning
thresholds on the calibration corpus.

Of the 1,405 reported false positives, 738 were card-layout pairs, 666 were screenshot pairs, and
one was a photograph pair. A manual label audit found that the photograph pair contains two
near-duplicate sunset photographs from the same Solamachi viewpoint with almost identical city
geometry. It is related visual content despite having distinct Commons page IDs. Treating it as
label noise leaves 1,404 genuine same-template failures and does not change the failed decision.
The template failures were concentrated in asymmetric-to-asymmetric comparisons (1,351/1,405),
confirming that retained shared chrome can overwhelm item-specific content.

The independent run measured:

- generation p50/p95: 116.73/416.27 ms across 2,000 fingerprints;
- locked comparison p50/p95: 1.70/2.52 ms across 146,050 pairs;
- serialized fingerprint p50/p95: 34,716/39,442 bytes;
- retained features p50/p95: 128/128.

Retrieval calibration was not run after the quality gate failed. The next algorithmic work must add
an item-specific signal or an explicit product-level template ambiguity policy; scaling the current
retrieval index would not correct the verifier's false positives.

Before any public proposal:

1. add and independently validate an item-specific signal for template-only crops, or explicitly
   exclude item identity from the supported product semantics;
2. record related-source labels so near-duplicate source files are not automatically counted as
   unrelated negatives;
3. measure retrieval on a realistically large reference collection only after the quality gate can
   pass without calibration-set threshold changes;
4. further reduce generation time and serialized size under predeclared budgets;
5. expand exact runtime fixtures beyond one procedural image;
6. define a bounded persisted representation separately from the accepted in-memory validation
   limits.

Retained evidence:

- [`benchmarks/crop-local/akaze-oracle-development-node22-2026-08-09.json`](../../benchmarks/crop-local/akaze-oracle-development-node22-2026-08-09.json)
- [`benchmarks/crop-local/sift-oracle-development-node22-2026-08-09.json`](../../benchmarks/crop-local/sift-oracle-development-node22-2026-08-09.json)
- [`benchmarks/crop-local/akaze-locked-source-disjoint-node22-2026-08-09.json`](../../benchmarks/crop-local/akaze-locked-source-disjoint-node22-2026-08-09.json)
- [`benchmarks/crop-local/typescript-development-node22-2026-08-09.json`](../../benchmarks/crop-local/typescript-development-node22-2026-08-09.json)
- [`benchmarks/crop-local/typescript-locked-source-disjoint-node22-2026-08-09.json`](../../benchmarks/crop-local/typescript-locked-source-disjoint-node22-2026-08-09.json)
- [`benchmarks/crop-local/typescript-locked-large-development-node22-2026-08-09.json`](../../benchmarks/crop-local/typescript-locked-large-development-node22-2026-08-09.json)
- [`benchmarks/crop-local/retrieval-development-node22-2026-08-09.json`](../../benchmarks/crop-local/retrieval-development-node22-2026-08-09.json)
- [`benchmarks/crop-local/browser-exactness-node22-2026-08-09.json`](../../benchmarks/crop-local/browser-exactness-node22-2026-08-09.json)
- [`benchmarks/crop-local/performance-optimization-node22-2026-08-09.json`](../../benchmarks/crop-local/performance-optimization-node22-2026-08-09.json)
- [`benchmarks/crop-local/independent-calibration-node22-2026-08-10.json`](../../benchmarks/crop-local/independent-calibration-node22-2026-08-10.json)
