# Crop-Local v0 Oracle Results

Status: item-color available as an explicit experimental preview; stable profile and card fallback blocked
Updated: 2026-08-10
Baseline: `a93b564e18e4121d28dfe2e5661e83d110ac2bde`

## Decision

Keep the grayscale `crop-local-v0`, research retrieval index, and card fallback internal. Expose
only the quality-confirmed item-color generator, verifier, and exact packed transport through
`image-fingerprint/experimental/crop-local`. Do not add a stable algorithm, freeze a persisted
schema, or add OpenCV to package dependencies. The preview boundary and compatibility limits are
recorded in [ADR 0008](../architecture/0008-crop-local-experimental-package-surface.md).

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

## Item-Color Development Candidate

The failed calibration corpus is now inspected development data. A separate internal
`crop-local-item-color-v0` wrapper preserves the grayscale fingerprint and adds two compact YCbCr
chroma planes. The aligned color check is veto-only: it can reject an existing local match but
cannot promote a local non-match or insufficient decision.

A development sweep rechecked all 1,500 positives and all 1,405 baseline false positives. The
selected policy retained every baseline true positive and reduced false positives from 1,405 to 25:

- 605/1,500 true positives: 40.3% recall, unchanged from the grayscale baseline;
- 25/144,550 represented false positives: 0.0173% false-positive rate;
- 96.0% precision under the same template-heavy negative population;
- eight surviving card-layout pairs and 17 surviving screenshot pairs;
- unchanged per-domain recall, including only 0.7% for card layouts.

The result passes the development gate but is not a new independent result. The color policy was
selected after inspecting this corpus and is now frozen for a new source-disjoint holdout. Color
also cannot distinguish grayscale or similarly colored templates, and it cannot restore candidates
lost during geometry. In particular, the result is not yet evidence that the profile is useful for
MTG card crops.

The enriched fingerprint measured 46,185/55,266 bytes at p50/p95. Generation measured
120.70/423.68 ms and comparison measured 4.10/12.72 ms at p50/p95. The quality improvement therefore
comes with measurable size and comparison costs that remain above any future public-profile budget.

## Item-Color Independent Holdout

After freezing the item-color policy, a new local-only holdout excluded both earlier development
corpora and the inspected 500-source calibration corpus by source identity, Commons page ID,
generated identity, and pixel SHA-256. It contains 300 new Public Domain/CC0 Commons sources plus
200 generated sources using a different style-4 screenshot/card family and seed range. The same
1,500 positive and 144,550 negative pairing contract was evaluated once with no threshold sweep.

The frozen profile produced:

- 745 true positives and 755 false negatives: 49.7% recall;
- five reported false positives and 144,545 true negatives: 0.00346% false-positive rate;
- 99.3% precision under the template-heavy negative population;
- 73.7% photograph, 77.7% portrait, 49.7% document, 32.3% screenshot, and 15.0% card-layout recall;
- zero false positives among 14,850 screenshot and 14,850 card-layout same-domain negatives.

All five domains exceeded the 10% guardrail, and the aggregate 20% recall/0.5% false-positive gates
passed. The profile therefore clears the independent quality gate without holdout tuning.

Manual review found that the photograph pair is two scans of the same marine artwork and one
portrait pair is two crops/scans of the same historical skiing photograph. The other three pairings
come from three distinct portraits digitized with the same large grayscale calibration strip and
studio-card layout. They remain counted as false positives; removing the two related-source labels
would only strengthen the result.

Holdout generation measured 119.63/299.45 ms at p50/p95, comparison measured 1.79/5.73 ms, and
serialized size measured 46,997/55,271 bytes. Quality is no longer the immediate blocker, but a
stable profile remains blocked on size/performance budgets, retrieval validation, broader
cross-runtime fixtures, and persisted-schema design. Card-layout recall at 15%
is materially better than the earlier 0.7%, but still too low to claim robust MTG crop matching.

## Exact-Output And Compact-Transport Optimization

The frozen profile and policy were not changed or rerun against holdout pixels. Exact-output work
instead removed a second full RGBA normalization/chroma allocation, resized the chroma values
directly with the same fixed-point operations, precomputed invariant FAST/orientation values, and
cached descriptor repetition counts using the comparator's existing immutable-value cache model.
On 40 deterministic procedural sources and their crops, the complete verbose fingerprint SHA-256
remained `d53c27402fb12135e29e101be115a78e1fd50a05e18c59b69b6d01e960911455`; all 820 comparison
decisions retained SHA-256 `8af4e8fbb491209e5604719dcf821257d5cfd64f16a5b9964b99c9eed1a275eb`.

A separately identified `crop-local-item-color-packed-v0` transport experiment stores the exact frozen
values as bounded binary fields in canonical base64url. It decodes and validates back to
`crop-local-item-color-v0` before comparison and makes no persisted-schema promise. The procedural
benchmark measured:

| Metric (p50/p95) | Commit `9bfd550` | Exact/packed candidate | Change |
| --- | ---: | ---: | ---: |
| Verbose generation | 80.20/127.35 ms | 74.88/122.05 ms | 6.6%/4.2% lower |
| Packed generation, including encode | 80.20/127.35 ms | 75.66/123.03 ms | 5.7%/3.4% lower |
| Comparison | 1.92/2.53 ms | 1.56/2.01 ms packed | 18.8%/20.7% lower |
| Serialized bytes | 49,940/56,284 | 25,365/29,589 packed | 49.2%/47.4% lower |

Packing and one-time unpacking measured 0.84/1.60 ms and 1.02/1.55 ms respectively. Exact unpacked
fingerprints and packed comparison decisions reproduced both hashes above. These measurements show
the implementation effect on a reproducible fixture; they do not replace the retained holdout
resource measurements or create a performance budget.

The verbose and packed fingerprints matched Node exactly in Chromium 151, Firefox 153, and WebKit
26.5 on both the main thread and a module worker for the existing procedural fixture. This confirms
the new encoding is deterministic across those runtimes, but it does not replace the remaining
requirement for broader exactness fixtures. Because the frozen values and comparison policy are
unchanged, the holdout's 745 true-positive and five false-positive decisions remain the applicable
quality evidence rather than a newly tuned or rerun result.

Before any stable profile proposal:

1. decide whether card-layout recall is sufficient for an explicitly bounded product use case;
2. record related-source labels so near-duplicate source files are not automatically counted as
   unrelated negatives;
3. measure retrieval on a realistically large reference collection only after the quality gate can
   pass without calibration-set threshold changes;
4. further reduce generation time and serialized size under predeclared budgets;
5. expand exact runtime fixtures beyond one procedural image;
6. define a bounded persisted representation separately from the accepted in-memory validation
   limits.

## Card-Recall Diagnosis And Development Fallback

The already-recorded item-color holdout was used only for post-hoc stage diagnosis. Its 100 CC0
style-4 card sources were regenerated from retained seeds, all encoded SHA-256 values were checked,
and the frozen 45/300 result reproduced exactly. Of 255 misses, 243 had descriptor candidates but no
accepted geometry; only 12 lacked the minimum four candidates. All 45 accepted geometries passed
both grayscale and color verification. Candidate formation is a secondary severe-crop limitation,
but geometry is the dominant failure stage.

A separate local-only development study used 91 uniquely identified Scryfall MTG print fixtures
from `MTG-Card-Analyzer`; no Scryfall or Wizards pixels were copied into this repository. It
evaluated 273 deterministic crop positives and 12,285 different-print hard negatives. The frozen
item-color profile produced 200 true positives and one false positive. Expanding to 192 features
added only seven true positives and one false positive, so feature density was rejected.

An additive card fallback instead preserves every frozen match, then retries only a frozen miss with
three-zone geometry and stronger grayscale/color verification. The selected development policy
produced 223/273 true positives (81.7% recall) and the same one false positive as the frozen profile.
It added 23 positives, including 22 severe crops; severe-crop recall rose from 28.6% to 52.7%.
Comparison p50/p95 increased from 1.76/1.97 ms to 3.47/3.83 ms.

After selection, post-hoc stress on the inspected style-4 card holdout produced 132/300 positives
(44.0%) and zero matches among 14,850 card-layout negatives, versus frozen results of 45/300 and
zero. This does not validate the new policy. A further untouched, source-disjoint MTG holdout must
show at least a five-point recall gain and zero additional false positives under predeclared gates
before any success claim. Camera/product captures must be reported separately from deterministic
clean-scan crops.

The implementation remains deep-internal under `crop-local-card-recall-v0-development`; it does not
change `crop-local-item-color-v0`, the experimental package entrypoint, or any persisted schema. See
[`ADR 0007`](../architecture/0007-crop-local-card-recall-development.md).

### Untouched MTG Holdout Decision

The development-selected card fallback was frozen and evaluated once on 100 new Scryfall printing
IDs across four release eras. The corpus excludes all development print IDs, names, and encoded
hashes; within the corpus, card name, oracle ID, illustration ID, printing ID, and encoded SHA-256
are unique. Pixels remain local-only. Three transformations per source produced 300 positives, and
three different-card pairings produced 14,850 negatives.

The frozen item-color profile produced 133/300 true positives (44.3% recall) and one false positive.
The card fallback produced 160/300 true positives (53.3% recall), the same one false positive, zero
additional false positives, and no lost frozen matches. Center recall was 95%, and severe-crop
recall improved from 30% to 50%. However, the separately reported normalized-capture simulation
improved only from 10% to 15%, below its predeclared 20% minimum. The overall untouched gate failed.

Manual review retained the one reported pair as a valid false positive: `Carapace` and `Aspect of
Wolf` are different Fifth Edition cards and illustrations sharing the green frame and Enchant
Creature structure. No threshold was changed or re-evaluated on the holdout. The candidate remains
internal, and the failed corpus is now inspected evidence only. Further work must improve
capture/product preprocessing on separate development data and use another untouched holdout for
any revised policy.

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
- [`benchmarks/crop-local/item-color-development-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-development-node22-2026-08-10.json)
- [`benchmarks/crop-local/item-color-holdout-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-holdout-node22-2026-08-10.json)
- [`benchmarks/crop-local/browser-item-color-exactness-node22-2026-08-10.json`](../../benchmarks/crop-local/browser-item-color-exactness-node22-2026-08-10.json)
- [`benchmarks/crop-local/item-color-performance-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-performance-node22-2026-08-10.json)
- [`benchmarks/crop-local/browser-item-color-packed-exactness-node22-2026-08-10.json`](../../benchmarks/crop-local/browser-item-color-packed-exactness-node22-2026-08-10.json)
- [`benchmarks/crop-local/card-holdout-diagnostic-node22-2026-08-10.json`](../../benchmarks/crop-local/card-holdout-diagnostic-node22-2026-08-10.json)
- [`benchmarks/crop-local/mtg-card-development-node22-2026-08-10.json`](../../benchmarks/crop-local/mtg-card-development-node22-2026-08-10.json)
- [`benchmarks/crop-local/mtg-card-holdout-node22-2026-08-10.json`](../../benchmarks/crop-local/mtg-card-holdout-node22-2026-08-10.json)
