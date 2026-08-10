# Crop-Block v1 Experiment Plan

Status: active internal experiment
Updated: 2026-08-09
Starting commit: `a93b564e18e4121d28dfe2e5661e83d110ac2bde`

## Boundary

The experiment may add internal source, tests, benchmark commands, and proposed documentation. It
must not add `crop-block-v1` to public algorithm unions, `fingerprintPixels()`, canonical codec,
root/subpath exports, `fingerprintImage()`, or README usage until the ADR is accepted.

## Stage 1: Deterministic Core

- Candidate A: integer luminance, fixed-point center-aligned bilinear resize to 300 square,
  separable 5-tap Gaussian `[1,4,6,4,1]/16`, then clamped 3×3 median.
- Candidate B: integer luminance, exact-coverage area resize to 300 square, separable 5-tap uniform
  box smoothing, then the same median.
- Threshold `>128`; equality is dark. Four-connectivity. Bright and dark components. Area `>500`.
- Map half-open boxes with floor starts and ceil ends. Hash mapped RGBA regions with exact
  BlockHash 16/2.
- Evaluate caps 16, 32, 64, and unlimited plus full-image fallback or empty behavior.

Acceptance: focused synthetic tests cover threshold equality, diagonal separation, edges, 500/501,
both polarities, ordering, mapping on odd sizes, small mapped boxes, cap tie-breaks, fallback, and
duplicate evidence. Existing BlockHash and PDQ tests remain exact.

## Stage 2: Comparison

Build the bounded pairwise matrix and implement:

1. directed nearest neighbor, with target reuse visible in evidence;
2. mutual nearest neighbor with deterministic tie handling;
3. one-to-one maximum-cardinality matching, minimizing total distance among maximum matchings.

Acceptance: identity, symmetry where applicable, directionality, ties, target-reuse, cutoff
boundaries, empty sets, and one-to-one cardinality are tested. No function calls the result a metric
or probability.

## Stage 3: Benchmark

Use an offline procedural corpus first: structured originals, controlled center/asymmetric crops,
borders, resize, brightness changes, low-information inputs, and unrelated same-layout negatives.
Compare both candidates, caps, fallback modes, all three match strategies, full-image BlockHash, and
PDQ. Report corpus counts, threshold sweeps, precision, recall, false-positive/negative rates,
segment distributions, fallback rate, serialized diagnostic bytes, p50/p95 generation/comparison
latency, and memory deltas. Real licensed images are a separate required release gate.

After selecting the segmentation profile, compare BlockHash 16/2 and PDQ child fingerprints over
the exact same mapped region boxes. Keep cap, fallback, polarity, one-to-one matching, and coverage
fixed; sweep PDQ quality gates separately. This decides whether the next candidate remains
`crop-block-v1` or should become `crop-pdq-v1` without changing standalone PDQ.

Commands:

```sh
pnpm test -- __tests__/crop-block-*.test.ts
pnpm crop-block:experiment
pnpm crop-block:mixed:prepare -- --output /outside-repository/mixed-crop-block --per-domain 10
pnpm crop-block:mixed -- --manifest /outside-repository/mixed-crop-block/manifest.json --output results.json
pnpm check
pnpm test:browser
```

## Stop/Go Gates

Stop rather than freeze `crop-block-v1` if either candidate lacks material crop recall over both
global baselines at an acceptable measured false-positive rate, produces unbounded/generic regions,
or cannot reproduce exact segments and child hashes across supported runtimes from identical RGBA.

If the procedural study passes, add a licensed real-image corpus, predeclare operating constraints,
repeat the study, recommend one preprocessing pipeline/cap/fallback/matcher, and request maintainer
approval of ADR 0004. Only an accepted decision authorizes public schema and API implementation.

The mixed-domain confirmation was run on 2026-08-09 and failed its predeclared false-positive gate.
The current profile therefore stops before ADR approval or public implementation. Diagnostic sweeps
may explain the failure but must not be relabeled as confirmation evidence.
