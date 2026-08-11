# ADR 0007: Crop-Local Card-Recall Development Fallback

Status: untouched MTG quality gate failed; internal experiment only
Updated: 2026-08-10

## Context

The frozen `crop-local-item-color-v0` profile passed its independent aggregate quality gate, but
matched only 45/300 card-layout positives (15%). The retained report did not contain enough
per-positive evidence to identify the failed stage.

The exact 100-source style-4 card slice can be regenerated from the retained CC0 generator seeds.
A post-hoc diagnostic verified every encoded SHA-256 and reproduced 45/300 matches. Descriptor
candidates were available for 288/300 pairs; 243 pairs then reported no consistent crop transform
and 12 had too few candidates. Every geometry pass also passed grayscale and color verification.
The dominant limitation is therefore geometry acceptance, not color veto or grayscale rejection.
This holdout is inspected diagnostic data and was not used to select the fallback policy.

## Proposed Decision

- Keep `crop-local-item-color-v0`, its fingerprint shape, and its frozen thresholds unchanged.
- Add a deep-internal comparator labeled `crop-local-card-recall-v0-development`. It is not exported
  from a package entrypoint and has no persisted or compatibility-stable representation.
- Run the frozen item-color comparison first. Return every frozen match unchanged.
- Only after a frozen miss, retry with three spatial geometry zones and a 25% inlier ratio, then
  require stronger aligned grayscale and color evidence: 72% dense grayscale agreement, at most
  12% dense contradiction, four grayscale zones, 70% color agreement, at most 5% color
  contradiction, and three color zones.
- Treat the fallback as development-selected. Do not describe it as validated until a further
  untouched, source-disjoint, MTG-relevant holdout passes predeclared recall and false-positive
  gates.

The additive ordering is part of the experimental contract. A fallback can promote a frozen miss;
it cannot reject or otherwise reinterpret a frozen match.

## Development Evidence

The separate development corpus uses all 91 enabled, uniquely identified Scryfall print fixtures
in a local `MTG-Card-Analyzer` checkout. It contains 273 deterministic crop positives and 12,285
different-print negatives across original/original, original/asymmetric, and
asymmetric/asymmetric pairings. Printing identity, Scryfall URL, dimensions, byte length, and local
encoded SHA-256 are retained. Scryfall/Wizards pixels remain outside this repository.

| Development profile | TP / positives | Recall | FP / negatives | Observed FP rate |
| --- | ---: | ---: | ---: | ---: |
| Frozen item-color v0 | 200 / 273 | 73.3% | 1 / 12,285 | 0.00814% |
| Expanded 192 features | 207 / 273 | 75.8% | 2 / 12,285 | 0.01628% |
| Additive relaxed geometry, locked verification | 228 / 273 | 83.5% | 2 / 12,285 | 0.01628% |
| Additive balanced fallback (selected) | 223 / 273 | 81.7% | 1 / 12,285 | 0.00814% |
| Additive strong fallback | 216 / 273 | 79.1% | 1 / 12,285 | 0.00814% |

The selected fallback adds 23 positives without adding a development false positive. Twenty-two
promotions are severe crops, increasing severe-crop recall from 26/91 (28.6%) to 48/91 (52.7%).
Comparison p50/p95 rises from 1.76/1.97 ms to 3.47/3.83 ms because frozen misses require a second
comparison. Expanding feature storage was rejected: its small recall gain added one false positive
and raised serialized p50 size from 41,348 to 52,152 bytes.

After selection on the MTG development set, the candidate was stress-tested post hoc on the already
inspected style-4 holdout slice. It reached 132/300 positives (44.0%) versus the frozen 45/300 and
reported zero matches for both policies among 14,850 card-layout negatives. This is useful
regression evidence, not independent confirmation.

## Required Next Validation

Before any success or compatibility claim, freeze this policy and evaluate it once on another
untouched corpus that excludes all earlier crop-local corpora, all 91 development print IDs, and all
pixel SHA-256 values. Predeclare at least:

1. 100 source-disjoint MTG printings with layout, treatment, color, age, and set diversity;
2. 300 or more positives, including deterministic crops and separately reported real camera or
   product-representative captures rather than clean-scan crops alone;
3. at least 14,850 different-print hard negatives with same-frame/color/layout representation;
4. at least a five-percentage-point recall gain over frozen item-color v0; and
5. zero additional false positives over the frozen decisions, with all related-print or
   alternate-scan labels audited before scoring.

Passing that comparison would establish only the bounded card use case. Public schema, retrieval,
size, runtime, browser-fixture, and maintainer-approval gates would still remain.

## Untouched MTG Holdout Result

The frozen policy was evaluated once on a new 100-print corpus with no threshold sweep. It excludes
all 91 development printing IDs, names, and encoded hashes and also requires unique oracle and
illustration IDs within the holdout. Twenty-five sources come from each of four release eras
(1993–2002, 2003–2012, 2013–2022, and 2023–2026), spanning 80 sets, eight color categories, seven
layouts, and six treatment styles. Scryfall/Wizards JPEGs remain local-only.

The 300 positives contain a center crop, severe crop, and normalized-capture simulation per source.
The normalized-capture mode represents post-extraction crop, exposure, white balance, reduced
resolution, and blur separately from clean crops; it is not a real camera corpus. Three negative
pairings per different-card pair produce 14,850 hard negatives.

| Holdout result | Frozen item-color v0 | Card fallback |
| --- | ---: | ---: |
| Aggregate TP / positives | 133 / 300 | 160 / 300 |
| Aggregate recall | 44.3% | 53.3% |
| Center-crop recall | 93% | 95% |
| Severe-crop recall | 30% | 50% |
| Normalized-capture recall | 10% | 15% |
| FP / negatives | 1 / 14,850 | 1 / 14,850 |
| Additional candidate false positives | — | 0 |

The candidate passed the five-point aggregate recall-gain requirement with a nine-point gain,
preserved every frozen match, and added no false positives. It failed the predeclared 20%
normalized-capture floor, reaching only 15%, so the overall gate failed. The policy remains an
internal experiment and this holdout is now inspected data that cannot be used for threshold
selection.

The single reported negative is inherited from the frozen profile: `Carapace` (5ED 281) versus
`Aspect of Wolf` (5ED 278). Manual review confirmed distinct card and illustration identities that
share the Fifth Edition green frame and Enchant Creature layout. It remains a valid false positive.

Future work should develop stronger capture normalization or an upstream product preprocessing
contract on separate data, preferably including labeled device captures. Any changed policy then
requires another untouched, source-disjoint holdout; the failed 100-print corpus must not become
its validation set.

## Compatibility

- `crop-local-item-color-v0` is unchanged.
- `pdq-v1`, `blockhash-v1`, public package entrypoints, and public fingerprint schemas are
  unchanged.
- `crop-local-card-recall-v0-development` is a source-internal experiment without a public or
  persisted compatibility promise.

## Retained Evidence

- [`card-holdout-diagnostic-node22-2026-08-10.json`](../../benchmarks/crop-local/card-holdout-diagnostic-node22-2026-08-10.json)
- [`mtg-card-development-node22-2026-08-10.json`](../../benchmarks/crop-local/mtg-card-development-node22-2026-08-10.json)
- [`mtg-card-holdout-node22-2026-08-10.json`](../../benchmarks/crop-local/mtg-card-holdout-node22-2026-08-10.json)
- [Crop-Local v0 results](../modernization/crop-local-v0-results.md)
- [Item-color experiment](./0006-crop-local-item-color-experiment.md)
