# PDQ MTG Matching Calibration

Status: initial exact-printing calibration complete

Updated: 2026-08-09

## Outcome

Keep `PDQ_STARTING_POLICY` at the explicit `{ maxDistance: 31, minQuality: 50 }` conservative
starting point. Do not automatically apply it, and do not present it as a universal MTG scanner
threshold.

On this hard real-camera corpus, an unrectified full camera frame was not a usable standalone PDQ
matching input. A caller-supplied axis-aligned card region was materially better, but still had too
much false-negative overlap for PDQ to be the only exact-printing decision. Applications should use
the distance as a candidate/ranking signal and calibrate their own policy after their actual crop,
perspective, decoder, lighting, device, and reference-image pipeline is fixed.

## Corpus and rights boundary

The benchmark uses the [Sol Ring Dataset](https://huggingface.co/datasets/HanClinto/solring-eval)
at commit `11f4c7ba2201dfc67df88093ed49ca8013f23b14`. Its publisher describes the dataset as 307 mobile
camera frames of 21 Sol Ring printings, all sharing the Mike Bierik artwork, and releases the
dataset under CC BY-SA 4.0.

The source images are not committed to this repository, included in the npm package, or copied into
the retained result. They stay in a local dataset clone. This conservative boundary also recognizes
that Magic cards contain underlying Wizards and artist IP; the
[Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) does not turn
that underlying material into MIT-licensed package content.

The generated manifest records:

- source revision, license, attribution, file SHA-256, and byte length;
- exact Scryfall printing identity and source frame number;
- the dataset-provided card corners converted to a normalized axis-aligned caller region;
- positive/negative expectation, full-image/crop-region scope, and transformation categories.

The measured manifest SHA-256 was
`7e1323980c92316cb22902ef3197f28681b4ca714eb0862e884e8c21a7d01c69`.

## Pair design

The matching goal in this first corpus is **exact printing**, not merely the shared card name:

- adjacent camera frames of the same physical printing are positive pairs;
- representative frames from different printings are hard negatives;
- every relationship is measured once as complete 1080×1920 camera frames and once using the
  caller-supplied card bounding regions;
- crop selection remains benchmark metadata. No detector, corner finder, perspective transform, or
  MTG policy entered the package core.

This produced 992 labeled comparisons: 572 positives, 420 negatives, 496 full-image pairs, and 496
crop-region pairs. The raw report retains each fingerprint hash, quality, distance, label, resolved
pixel region, threshold sweep, and hard-case list.

## Results

The run used Node.js 24.19.0 on Darwin arm64. At the existing starting policy:

| Scope | Precision | Recall | False-positive rate | False-negative rate | TP / FP / TN / FN |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overall | 95.83% | 8.04% | 0.48% | 91.96% | 46 / 2 / 418 / 526 |
| Full camera frame | 100.00% | 0.35% | 0.00% | 99.65% | 1 / 0 / 210 / 285 |
| Caller card region | 95.74% | 15.73% | 0.95% | 84.27% | 45 / 2 / 208 / 241 |

The crop-region tradeoff at selected distance thresholds, all with minimum quality 50, was:

| Maximum distance | Precision | Recall | False-positive rate | False-negative rate |
| ---: | ---: | ---: | ---: | ---: |
| 31 | 95.74% | 15.73% | 0.95% | 84.27% |
| 40 | 95.83% | 24.13% | 1.43% | 75.87% |
| 64 | 88.49% | 43.01% | 7.62% | 56.99% |
| 80 | 82.80% | 53.85% | 15.24% | 46.15% |
| 96 | 76.67% | 64.34% | 26.67% | 35.66% |

All measured fingerprints had quality 100. Sweeping minimum quality through 0, 25, 40, 49, 50,
51, 60, 70, 80, and 90 therefore had no effect. The corpus supports retaining 50 as a cautious
ecosystem starting value, but it does **not** calibrate the quality cutoff. Low-information and
degraded-capture calibration remains application-specific.

## Hard-case review

The nearest crop-region hard negative was C20 versus CMR at distance 20. Those printings share art
and much of the layout, demonstrating why PDQ alone cannot establish exact printing. Other
different-printing crop negatives occurred at distances 28, 34, and 44.

Positive adjacent frames overlapped broadly with negatives. Crop-positive distance had median 78
and maximum 140; full-frame positive distance had median 124 and maximum 162. Moving the card,
perspective changes, and changing background coverage dominate a perceptual hash intended for copy
similarity.

## Usage guidance

- Use `{ maxDistance: 31, minQuality: 50 }` only as a conservative initial confirmation policy for
  already-normalized near-duplicate inputs.
- Do not use PDQ equality or a single distance threshold to identify unrectified full camera frames.
- A distance above 31 is not proof that caller-produced card regions are different; in this corpus,
  most true pairs exceeded it.
- For MTG scanning, normalize the card region consistently and use PDQ to shortlist/rank candidates,
  then apply a stronger application verifier when exact printing matters.
- Re-run this benchmark on the application's reference images, devices, crop/perspective pipeline,
  foil/non-foil treatments, languages, frames, and damaged/sleeved cards before shipping a policy.
- Keep the policy caller-controlled. No new public API or hidden default follows from this report.

## Reproduction

Clone the source dataset at the pinned revision and fetch its Git LFS objects. Then run:

```sh
pnpm pdq:matching:prepare -- \
  --dataset /outside-repository/solring-eval \
  --output /outside-repository/solring-eval/image-fingerprint-manifest.json

pnpm pdq:matching -- \
  --manifest /outside-repository/solring-eval/image-fingerprint-manifest.json \
  --output benchmarks/pdq/results/mtg-solring-node24-2026-08-09.json
```

The retained evidence is
[`benchmarks/pdq/results/mtg-solring-node24-2026-08-09.json`](../../benchmarks/pdq/results/mtg-solring-node24-2026-08-09.json).
