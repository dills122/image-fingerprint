# Crop-Local Oracle Experiment

This directory contains the internal `crop-local-v0` research oracle. It uses pinned OpenCV AKAZE
and SIFT implementations to determine whether strong multiscale features, conservative uniform-scale
and translation geometry, and transform-aligned content verification justify another pure-TypeScript
prototype. It does not add OpenCV to the library and does not define a public algorithm profile.

Run the PEP 723-pinned script with `uv`:

```sh
uv run --script benchmarks/crop-local/oracle.py \
  --manifest /outside-repository/mixed-crop-block/manifest.json \
  --output benchmarks/crop-local/<oracle-development-name>.json
```

The first run downloads `opencv-python-headless==4.12.0.88` and `numpy==2.2.6` into the `uv` cache.
Source images remain outside the repository. The output records their manifest checksum, tool
versions, aggregate profiles, per-domain positives, and per-domain-pair negatives.

The current mixed corpus has already been inspected and is development evidence only. Passing its
oracle and geometry gates permits a source-disjoint development study; it does not authorize a
public profile or a final false-positive claim.

After development selection, evaluate only the locked AKAZE profile on new source-disjoint data:

```sh
uv run --script benchmarks/crop-local/oracle.py \
  --manifest /outside-repository/source-disjoint/manifest.json \
  --output benchmarks/crop-local/<locked-source-disjoint-name>.json \
  --method akaze \
  --locked-akaze-development-profile
```

Build and run the internal pure-TypeScript development selection:

```sh
pnpm crop-local:typescript:develop -- \
  --manifest /outside-repository/development/manifest.json \
  --output benchmarks/crop-local/typescript-development.json
```

Add `--locked-development-profile` for a source-disjoint confirmation after the development policy
has been frozen. Repeat `--manifest` to combine local corpora; `--expanded-negatives --summary-only`
adds five unrelated variant pairings per source pair while retaining a bounded aggregate report.
Cross-runtime exactness for both the grayscale and item-color fingerprints, plus the small
grayscale retrieval pilot, run with:

```sh
pnpm crop-local:browser
pnpm crop-local:retrieval:develop -- \
  --manifest /outside-repository/development/manifest.json \
  --output benchmarks/crop-local/retrieval-development.json
```

Prepare the independent calibration gate outside the repository after both 50-source development
manifests are available:

```sh
pnpm crop-local:calibration:prepare -- \
  --output /outside-repository/crop-local-calibration-v1 \
  --exclude-evidence benchmarks/crop-local/typescript-development-node22-2026-08-09.json \
  --exclude-evidence benchmarks/crop-local/typescript-locked-source-disjoint-node22-2026-08-09.json
```

The builder is fixed at 100 sources in each of five domains (500 total) and records three
deterministic crops per source (1,500 transformations). It rejects page IDs, generated identities,
and pixel SHA-256 values found in either development evidence set. The builder also accepts
`--exclude-manifest` when the original local manifest is still available. Commons selections retain their
license/provenance metadata; screenshot and card-layout sources use a new deterministic style-3
generator. Downloads are resumable through a local progress file, and the output path is required
to remain outside the repository.

Evaluate only the already-locked policy, then measure retrieval without selecting new thresholds:

```sh
pnpm crop-local:calibration -- \
  --manifest /outside-repository/crop-local-calibration-v1/manifest.json \
  --output /outside-repository/crop-local-calibration-v1/quality-summary.json
pnpm crop-local:calibration:retrieval -- \
  --manifest /outside-repository/crop-local-calibration-v1/manifest.json \
  --output /outside-repository/crop-local-calibration-v1/retrieval-summary.json
```

Retain a provenance-complete report without every repeated false-positive row:

```sh
pnpm crop-local:calibration:compact -- \
  --input /outside-repository/crop-local-calibration-v1/quality-summary.json \
  --output benchmarks/crop-local/independent-calibration-node22-2026-08-10.json
```

The independent 2026-08-10 run failed the frozen quality gate, so retrieval calibration was not
run. See [`docs/modernization/crop-local-v0-results.md`](../../docs/modernization/crop-local-v0-results.md)
for the decision and failure analysis.

Use that now-inspected corpus only for development of the supplemental item-color veto:

```sh
pnpm crop-local:item-color:develop -- \
  --manifest /outside-repository/crop-local-calibration-v1/manifest.json \
  --baseline /outside-repository/crop-local-calibration-v1/quality-summary.json \
  --output benchmarks/crop-local/item-color-development-node22-2026-08-10.json
```

The evaluator rechecks all positives and every retained baseline false positive. This is complete
for a veto-only signal because pairs rejected by the base verifier cannot be promoted. Its selected
policy is frozen in code but still requires a new source-disjoint untouched holdout. See
[`docs/architecture/0006-crop-local-item-color-experiment.md`](../../docs/architecture/0006-crop-local-item-color-experiment.md).

Build that holdout outside the repository with all three earlier corpora excluded. The holdout uses
a new style-4 generated family and seed range:

```sh
pnpm crop-local:item-color:holdout:prepare -- \
  --output /outside-repository/crop-local-item-color-holdout-v1 \
  --exclude-evidence benchmarks/crop-local/typescript-development-node22-2026-08-09.json \
  --exclude-evidence benchmarks/crop-local/typescript-locked-source-disjoint-node22-2026-08-09.json \
  --exclude-manifest /outside-repository/crop-local-calibration-v1/manifest.json \
  --commons-start-offset 6000 \
  --synthetic-seed-offset 200000

pnpm crop-local:item-color:holdout -- \
  --manifest /outside-repository/crop-local-item-color-holdout-v1/manifest.json \
  --output benchmarks/crop-local/item-color-holdout-node22-2026-08-10.json

pnpm crop-local:item-color:retrieval -- \
  --manifest /outside-repository/crop-local-item-color-holdout-v1/manifest.json \
  --output benchmarks/crop-local/item-color-retrieval-holdout-node22-2026-08-10.json
```

The 2026-08-10 single frozen-policy run passed the independent quality gate with 49.7% recall and
five reported false positives among 144,550 negatives. It does not authorize a public profile;
size, performance, large-scale retrieval, cross-runtime, schema, and approval gates remain. The
separate frozen retrieval run passed its 500-reference candidate-recall gate at 98.66% recall@50
for verifier-accepted queries, while showing that the JSON ranker still scores evidence from nearly
every reference. See
[`docs/modernization/crop-local-item-color-retrieval-results.md`](../../docs/modernization/crop-local-item-color-retrieval-results.md).

The TypeScript code, profiles, persisted shapes, and retrieval index remain internal experiments.
None are exported from the package root.

Final verification is directional: call `compareCropLocalSourceToCrop(source, crop)` even when a
crop-query retrieval index found the source candidate. `match` means the aligned pixels are visually
consistent; it is not proof of item identity for template-only crops. See
[`docs/architecture/0005-crop-local-experiment-contract.md`](../../docs/architecture/0005-crop-local-experiment-contract.md).
