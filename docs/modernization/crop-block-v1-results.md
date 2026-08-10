# Crop-Block v1 Experiment And Confirmation Results

Status: mixed-domain confirmation failed; public profile is blocked
Updated: 2026-08-09
Baseline: `a93b564e18e4121d28dfe2e5661e83d110ac2bde`

## Decision

Do not freeze or export `crop-block-v1`. The area/box, cap-16, empty-fallback, one-to-one candidate
advanced through the procedural and Met studies but failed the larger predeclared mixed-domain
confirmation gate. Keep the implementation and comparison policies internal.

The procedural study demonstrates a material crop-recall benefit, deterministic cross-runtime
execution, and bounded runtime. A follow-up local-only Met Open Access study confirms a useful
precision/recall region and shows that matching region polarity matters. The evidence is still too
small and domain-specific to approve a public policy or schema.

The mixed-domain study shows that one matching region plus 25% query coverage admits generic region
hashes at an unacceptable rate. Stricter coverage, multiple-match, bit-balance, and eligible-region
diagnostics did not recover useful recall below the false-positive gate. The next design round must
change region distinctiveness or segmentation rather than tune the current distance threshold.

An additional controlled child-hash bakeoff used the exact same detected regions and comparison
policy with either BlockHash 16/2 or PDQ. BlockHash remains the selected child, so the candidate
name remains `crop-block-v1`; `crop-pdq-v1` does not advance. This experiment does not change or
replace the library's existing public full-image `pdq-v1` implementation.

## Child-Hash Bakeoff

Both child candidates used the same area/box preprocessing, 300×300 grid, strict threshold,
four-connected components, mapped source boxes, 16-segment cap, empty fallback, polarity rule,
one-to-one matcher, and 25% query-coverage requirement. The only generation variable was the
256-bit child hash. PDQ quality gates of 0, 25, and 50 were also measured.

On the 40-positive/380-negative Met study, the best measured conservative points were:

| Child hash | Distance | Quality gate | TP | FP | Recall | False-positive rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BlockHash 16/2 | 64 | n/a | 12 | 1 | 30.0% | 0.26% |
| PDQ | 96 | 0 | 8 | 0 | 20.0% | 0.00% |
| PDQ | 112 | 0 | 15 | 39 | 37.5% | 10.26% |

The extended PDQ sweep matters: its recall improved above distance 96 only with an abrupt and
unacceptable false-positive increase. Quality cutoffs 25 and 50 did not change any Met decision
because the relevant artwork regions had high PDQ quality. On the procedural corpus they reduced
both positives and false positives but did not outperform BlockHash at a comparable operating
point.

BlockHash was also the lighter child on the same 60 Met-derived images. Its generation p50/p95 was
15.80/20.79 ms versus PDQ's 19.25/30.43 ms. Diagnostic JSON p50/p95 was 721/1,601 bytes versus
757/1,707 bytes because PDQ retains per-region quality. Matching cost was effectively equal because
both children are 256 bits and use the same matcher.

These results select BlockHash for the next study, not for a public release. Crop-PDQ remains useful
as an internal negative result and a possible future candidate if a broader corpus reveals a better
quality-aware policy.

## Corpus

The offline `procedural-structured-v1` corpus contains 17 generated RGBA images, nine positive crop
pairs, and 15 negatives. Positives include center crops retaining 48.5% area, asymmetric crops with
a small brightness shift, and a many-region crop retaining 56.25% area. Negatives include distinct
structured patterns, sibling crops, and flat black/white/transparent images. No external pixels or
decoder behavior are involved.

This sample cannot support confidence intervals or rare false-positive claims. Its purpose is to
reject weak designs and choose what deserves a licensed corpus—not select a threshold.

## Matching Results

The table shows each method's best measured recall-minus-false-positive-rate point from the limited
threshold sweep. It is descriptive, not a recommended operating point.

| Candidate | Threshold | Precision | Recall | False-positive rate |
| --- | ---: | ---: | ---: | ---: |
| Full-image BlockHash 16/2 | 96 | 60.0% | 33.3% | 13.3% |
| Full-image PDQ | 48 | 0.0% | 0.0% | 6.7% |
| Area/box, directed | 80 | 61.5% | 88.9% | 33.3% |
| Area/box, mutual | 80 | 63.6% | 77.8% | 26.7% |
| Area/box, one-to-one | 64 | 66.7% | 88.9% | 26.7% |

Crop-aware one-to-one matching recovered eight of nine positives versus three of nine for global
BlockHash. However, four of 15 negatives also matched. This confirms both the feature's value and
the danger of shipping a permissive one-region rule. Directed target reuse was no better and has
weaker semantics; one-to-one remains the safest candidate because it prevents score inflation and
has auditable maximum-cardinality/minimum-distance behavior.

## Profile And Resource Evidence

The area/box candidate was slightly faster and matched or improved the Gaussian candidate's measured
accuracy. With cap 16 and empty fallback on Node 22.22.1/Darwin arm64:

- generation p50/p95: 8.41/9.33 ms;
- comparison p50/p95 at the displayed one-to-one point: 0.040/0.071 ms;
- segment count p50/p95: 3/16;
- diagnostic JSON size p50/p95: 719/3,021 bytes.

Raising the cap to 32 increased p95 diagnostic size to 5,886 bytes; uncapped reached 6,563 bytes and
36 p95 segments on the many-region input without improving this corpus's aggregate decisions. Cap
16 therefore advances as the resource-conscious candidate, not as a frozen universal optimum.

Explicit fallback was not activated by these normal profiles: even flat images form one accepted
full-grid bright or dark component. That observation makes a region-information gate more important
than fallback alone. The next round should measure child-hash bit balance, unique-hash count, region
area share, polarity agreement, and fallback/flat eligibility without silently incorporating them
into generation identity.

Approximate whole-run heap growth was 2.55 MB. It is diagnostic only, not a fresh-process peak-memory
measurement.

## Cross-Runtime Exactness

Both preprocessing and both child-hash candidates produced exactly equal segment metadata, child
hashes, and PDQ quality values from the same RGBA fixture in Node 22.22.1, Chromium 151.0.7922.34,
Firefox 153.0, and WebKit 26.5, on both
the main thread and a module worker. The browser artifact was temporary and is not exported or
packaged.

## Remaining Go Gates

Before accepting ADR 0004 or assigning public meaning to `crop-block-v1`:

1. Add a redistribution-approved real-image transformation corpus with many more unrelated and
   same-layout hard negatives.
2. Compare explicit region-quality gates and coverage/minimum-region policies; require an operating
   point with an acceptable predeclared false-positive rate.
3. Recheck caps, fallback/flat eligibility, duplicates, polarity, and segment split/merge cases.
4. Capture fresh-process generation/comparison memory and larger-image latency.
5. Decide the persistent multi-fingerprint schema and parser allocation limits.
6. Obtain maintainer approval of proposed ADR 0004 before changing public types or exports.

Raw evidence is
[`benchmarks/crop-block/results/procedural-node22-2026-08-09.json`](../../benchmarks/crop-block/results/procedural-node22-2026-08-09.json).

## Met Open Access Study

Twenty varied public-domain artwork images were downloaded locally from The Metropolitan Museum of
Art Collection API. Every accepted object reported `isPublicDomain: true` and a non-empty Open
Access image. The Met designates these images and collection data CC0. Source pixels and the complete
download manifest remain outside the repository; the retained report records object IDs, titles,
object pages, SHA-256 image checksums, and license assertions.

Two controlled crops per source produced 40 positives. All pairs of different original images and
their sibling center crops produced 380 negatives. The most useful conservative measured point was:

```text
generation: area-box, cap 16, empty fallback
matching: one-to-one, same polarity, minimum query coverage 0.25
maximum region distance: 64
```

It produced 12 true positives, one false positive, 379 true negatives, and 28 false negatives:

- precision 92.3% (Wilson 95% interval 66.7–98.6%);
- recall 30.0% (18.1–45.4%);
- false-positive rate 0.26% (0.05–1.48%).

At distance 48 the corpus had no false positives and 17.5% recall. The upper Wilson bound for zero
false positives among 380 negatives is still about 1.0%, so this cannot justify a rare-error claim.

At distance 64, ignoring polarity retained the same recall but increased false positives from one
to three. Bit-balance cutoffs from 0 through 64 did not alter the Met result. Polarity should advance
as comparison policy; bit balance should remain experimental until a broader low-information corpus
justifies it.

For comparison, full-image BlockHash at distance 64 found one of 40 positives with one false
positive. PDQ found none through distance 96. Crop-aware matching is therefore a materially
different capability, while its 30% conservative recall confirms that it is not a universal answer
to deep cropping.

The retained evidence is
[`benchmarks/crop-block/results/met-open-access-node22-2026-08-09.json`](../../benchmarks/crop-block/results/met-open-access-node22-2026-08-09.json).

### Met-stage recommendation (superseded by mixed-domain confirmation)

The Met study advanced this candidate into the larger mixed-domain confirmation study with:

- deterministic area resize, 5-tap box smoothing, and 3×3 median;
- 300×300 grid, strict `>128`, four-connected bright/dark components, area `>500`;
- exact BlockHash 16/2 child hashes;
- cap 16 and empty fallback;
- one-to-one maximum-cardinality/minimum-distance comparison;
- same-polarity matching;
- an experimental study policy of distance 64, at least one match, and at least 25% query coverage.

The distance and coverage values are not public defaults. Before ADR acceptance, repeat on
photographs, screenshots, documents, logos, portraits, and same-layout hard negatives; increase the
negative population substantially; and resolve the persisted multi-hash schema and parser limits.

Crop-PDQ is not recommended as the next profile on the current evidence. The existing standalone
`pdq-v1` remains available and unchanged for ordinary full-image perceptual matching.

## Mixed-Domain Confirmation

The independent `mixed-domain-crop-block-confirmation-v1` study contains 50 local-only sources:
10 photographs, 10 portraits, 10 scanned documents, 10 deterministic mock screenshots, and 10
deterministic card-like layouts. Wikimedia Commons supplied the first 30 only when API metadata
reported Public Domain or CC0, no restrictions, a source page, and a supported raster format. The
generated fixtures are CC0. The report retains provenance, licenses, source-page URLs, SHA-256
checksums, and the manifest hash, but not the downloaded pixels.

Three crops per source—center 49% area, asymmetric 50.8% area, and severe asymmetric 32.5% area—
produced 150 positives. All unrelated source pairs were compared as originals, sibling center crops,
and original-to-center pairs, producing 3,675 negatives. Before running, the selected Met policy was
required to remain at or below 0.5% false positives and exceed each global baseline's recall by at
least 10 percentage points.

At the frozen distance-64 policy it produced:

- 75 true positives and 75 false negatives: 50.0% recall (Wilson 95% interval 42.1–57.9%);
- 301 false positives and 3,374 true negatives: 8.19% false-positive rate (7.35–9.12%);
- 19.9% precision.

The recall-advantage gate passed, but the false-positive gate failed by more than a factor of 16.
Same-layout fixtures exposed the largest weakness: screenshot-to-screenshot pairs produced 113 of
135 false positives, card-layout pairs 80 of 135, and card-layout-to-screenshot pairs 89 of 300.
This was not solely a synthetic effect: the photograph/portrait/document subset still produced 15
false positives among 1,305 negatives, or 1.15%.

At exact child-hash distance 0, the original policy still produced 182 false positives. That proves
the primary failure is repeated generic region hashes rather than a loose Hamming cutoff.
Exploratory diagnostics were kept separate from the failed confirmation:

- requiring multiple matches plus bidirectional coverage reached at most 10.0% recall under the
  0.5% false-positive gate;
- adding child-hash bit-balance filters reached at most 6.7% recall under the gate;
- calculating coverage over only eligible high-information regions produced no positive matches
  under the gate.

Runtime and output remained bounded—generation p50/p95 21.00/44.83 ms, selected comparison p50/p95
0.075/0.245 ms, segment count p50/p95 3/7, and diagnostic JSON size p50/p95 718/1,427 bytes—but
resource safety cannot compensate for the failed matching policy.

The retained evidence is
[`benchmarks/crop-block/results/mixed-domain-node22-2026-08-09.json`](../../benchmarks/crop-block/results/mixed-domain-node22-2026-08-09.json).

### Stop recommendation

Do not promote the current segmentation plus BlockHash child design as `crop-block-v1`. A future
experiment should require region-level distinctiveness beyond hash bit balance—such as rejecting
uniform/low-entropy components, incorporating geometry or neighborhood context, or using a
different keypoint/region proposal method—and must predeclare its policy before evaluation on an
independently sampled confirmation corpus. Normal `blockhash-v1` and `pdq-v1` remain unchanged.

## Distinctive-Region v2 Development Spike

A bounded successor spike tested the most direct repair on the existing mixed-domain corpus, now
explicitly treated as development data. It added deterministic region entropy, edge-density,
luminance-range, and occupied-bin measurements; removed duplicate child hashes; required at least
two one-to-one matched regions; and retained only matches whose normalized boxes agreed on one
axis-aligned crop scale and translation.

The development grid evaluated 48 information profiles across exact, 32, 64, and 80-bit child
distance thresholds. Fixed spatial tolerances allowed 150 permille scale deviation and 100 permille
translation deviation, with at least 25% coverage in both directions.

No candidate justified a fresh holdout:

- the best point under the 0.5% false-positive gate matched five of 150 positives (3.3% recall) at
  exact distance 0 with no false positives;
- without information filtering, distance 80 reached only 8.7% recall with a 3.62% false-positive
  rate;
- an edge-density threshold of 30 eliminated false positives at distance 80 but retained only four
  positives (2.7% recall) and left 74 of 200 generated fingerprints without eligible regions.

The failure is structural. Bright/dark connected components are often internally uniform by
construction, so information filters discard the same regions the crop matcher needs. Requiring two
spatially consistent survivors then removes most remaining positives. Because the candidate failed
development, no independently sampled holdout was downloaded or evaluated; doing so would waste
holdout evidence and encourage post-hoc tuning.

The retained development grid is
[`benchmarks/crop-block/results/v2-development-node22-2026-08-09.json`](../../benchmarks/crop-block/results/v2-development-node22-2026-08-09.json).

### Revised next direction

Do not continue tuning connected bright/dark components. The next crop-resistance experiment should
start from repeatable local keypoints or textured region proposals, attach compact descriptors, and
use geometric-consensus matching. That is a new algorithm family, not `crop-block-v1` or a threshold
revision. It must remain internal until it passes development and a fresh holdout.

## Keypoint And Geometric-Consensus Development Spike

The recommended new-family spike was implemented as an internal, clean-room experiment inspired by
FAST-style corner detection and BRIEF-style binary intensity tests. It does not claim byte-level
compatibility with FAST, BRIEF, ORB, or another external implementation. The bounded fingerprint
contains at most 64 selected keypoints for this study, a deterministic 256-bit descriptor and local
mean RGB for each point, plus a 32×32 mean-color verification grid. Comparison uses mutual nearest
neighbors, a descriptor ratio test, uniform-scale/translation consensus, and a transformed-overlap
color veto. Nothing is added to the public algorithm union, record codec, or package entrypoints.

The existing 50-source mixed corpus was reused strictly as development data. Its 150 crop positives
and 3,675 unrelated negatives were evaluated across 320 predeclared combinations of descriptor
distance, ratio, local-color distance, inlier count, inlier ratio, and transformed-color distance.
The development gate required at most 0.5% false positives and at least 20% recall.

No candidate passed:

- the best profile under the false-positive gate found two of 150 crops (1.3% recall) with no false
  positives;
- at transformed mean-color distance 8, the highest-recall profile found 21 crops (14.0%) and 26
  false positives (0.71%); all false positives were screenshot-to-screenshot pairs;
- at distance 16, the highest-recall profile found 47 crops (31.3%) but admitted 79 false positives
  (2.15%), including same-layout screenshots and card layouts;
- the distance-8 point found crops only in the photograph and portrait domains. It found none of the
  document, screenshot, or card-layout crops.

The full-color grid repaired the earlier low-precision color quantization, but it exposed an abrupt
tradeoff: a tight veto rejects normal crop-grid resampling differences, while a permissive veto
again admits repeated layouts. Keypoint geometry therefore improves the representation but does not
by itself distinguish a partial copy from a different item built from the same visual template.

Resources remained bounded on Node 22.22.1/Darwin arm64: generation p50/p95 was 40.07/57.92 ms,
comparison p50/p95 was 0.034/0.278 ms, and diagnostic JSON p50/p95 was 17,587/17,653 bytes. These
figures describe an unoptimized internal representation, not a proposed public schema.

Because the development gate failed, no fresh holdout was created or inspected, and browser
exactness was not promoted to a release gate. Keep the implementation as negative experimental
evidence only. A future crop-aware effort needs a materially different verification signal—such as
layout-aware correspondence that measures discriminative structure, or a separately researched
feature family—rather than another threshold sweep over this design.

The retained development grid is
[`benchmarks/crop-keypoint/development-node22-2026-08-09.json`](../../benchmarks/crop-keypoint/development-node22-2026-08-09.json).

This stop decision applies to the single-scale keypoint implementation, not to all local-feature
approaches. The subsequent multiscale oracle and transform-aligned verification study passed its
locked source-disjoint gate. See
[`crop-local-v0-results.md`](./crop-local-v0-results.md) for the approved next experiment.
