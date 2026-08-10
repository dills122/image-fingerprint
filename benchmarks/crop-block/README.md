# Crop-Block Experiment

This directory contains the internal, offline profile-selection experiment for proposed ADR 0004.
It does not exercise a public `crop-block-v1` API.

The reports include a matched child-hash bakeoff. Crop-BlockHash and crop-PDQ use identical region
boxes and matching policy; PDQ additionally records child quality. Standalone public `pdq-v1` is
not modified by this experiment.

The `procedural-structured-v1` corpus is generated entirely by `experiment.mjs`: seeded colored
rectangles, controlled center/asymmetric crops, a many-region tile case, and flat low-information
images. It contains no third-party pixels and is safe to redistribute under the repository license.
The corpus is intentionally small and is useful for deterministic regression and early stop/go
evidence only. It cannot calibrate production false-positive rates or thresholds.

Run:

```sh
pnpm crop-block:experiment -- --output benchmarks/crop-block/results/<name>.json
pnpm crop-block:browser
pnpm crop-block:met:prepare -- --output /outside-repository/met-crop-block --count 20
pnpm crop-block:met -- \
  --manifest /outside-repository/met-crop-block/manifest.json \
  --output benchmarks/crop-block/results/<met-name>.json
pnpm crop-block:mixed:prepare -- --output /outside-repository/mixed-crop-block --per-domain 10
pnpm crop-block:mixed -- \
  --manifest /outside-repository/mixed-crop-block/manifest.json \
  --output benchmarks/crop-block/results/<mixed-name>.json
pnpm crop-block:v2:develop -- \
  --manifest /outside-repository/mixed-crop-block/manifest.json \
  --output benchmarks/crop-block/results/<v2-development-name>.json
pnpm crop-keypoint:develop -- \
  --manifest /outside-repository/mixed-crop-block/manifest.json \
  --output benchmarks/crop-keypoint/<keypoint-development-name>.json
```

The browser command bundles the internal prototype into a temporary development artifact and checks
identical RGBA fixtures against Node on Chromium, Firefox, and WebKit main threads and module
workers. Nothing from that temporary bundle enters the npm package.

The Met study accepts only records with `isPublicDomain: true` and an Open Access image. Downloaded
pixels and the complete local manifest stay outside the repository; retained results include object
IDs, object pages, image checksums, and CC0 assertions for auditability.

The mixed-domain confirmation corpus downloads local-only Public Domain or CC0 photographs,
portraits, and scanned documents from Wikimedia Commons. It combines them with deterministic CC0
mock screenshots and card-like layouts, avoiding third-party trademarks and uncertain screenshot
licensing. The retained report records source pages, licenses, checksums, domain-level results, and
Wilson intervals but not source pixels.

The v2 development command measures distinctive-region filters and spatial crop-transform
consistency on the already-inspected mixed corpus. Its output is development evidence only and must
not be relabeled as an independent confirmation result.

The keypoint development command measures the separate internal FAST/BRIEF-inspired descriptor and
geometric-consensus spike on that same already-inspected corpus. It is not an interoperable FAST,
BRIEF, or ORB implementation, and its output is also development evidence rather than a holdout.
