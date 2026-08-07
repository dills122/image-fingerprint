# Image Fingerprint Benchmark Requirements

Status: draft input to implementation planning
Updated: 2026-08-07

## Purpose

Select an implementation and threshold from evidence, while keeping decoder variance and hash-core
variance distinguishable.

## Corpus Layers

| Layer | Purpose | Expected assertion |
| --- | --- | --- |
| Synthetic raw pixels | Numeric and serialization conformance | Exact hash and quality |
| Meta regression fixtures | Cross-implementation behavior | Exact raw-pixel result; documented decoder tolerance |
| Current package examples | Legacy compatibility | Exact existing BMVB strings |
| Licensed transformation pairs | Product robustness | Labeled distance distributions |
| Licensed unrelated pairs | False-positive calibration | Labeled negative distributions |
| Low-information images | Quality behavior | Explicit rejection/quality evidence |

Every non-synthetic fixture needs provenance, license, expected relationship, and allowed
transformations. Do not copy an upstream corpus into the published npm artifact by default.

## Transformation Matrix

Test controlled levels, retaining the original parameters with each derived fixture:

- JPEG quality and lossless format re-encoding
- downscale/upscale and aspect-preserving resize
- brightness, contrast, saturation, and grayscale
- small watermark/logo and progressively larger overlays
- white/black borders
- crop percentages from mild through intentionally unsupported deep crops
- 90-degree rotations and horizontal/vertical/diagonal flips
- EXIF orientation represented as metadata and baked pixels
- alpha compositing against declared backgrounds
- blur, sharpen, and additive noise

## Measurements

- Hash-core Hamming distance for identical raw pixels across candidates.
- Decoder-integrated Hamming distance from the pinned Meta reference.
- Quality distributions and rejection counts.
- Threshold sweep for precision, recall, false-positive rate, and false-negative rate.
- Decode latency, core latency, total latency, throughput, and peak resident memory.
- Artifact/package size and cold-start cost for WASM/native candidates.
- Determinism across repeated runs, supported Node versions, and CI architectures.

Report p50, p95, and p99 latency where the sample size supports percentiles. Accuracy reports must
include corpus size and confidence/uncertainty, not only a single aggregate score.

## Candidate Exit Gate

A candidate can enter implementation planning only if it:

- exactly matches pinned Meta output for the agreed raw-pixel corpus
- documents any decoded-image deviation and stays within the approved tolerance
- has acceptable license and provenance
- runs deterministically on all target runtimes
- exposes or can expose both hash and quality
- has no unbounded native/WASM operational risk
- demonstrates a material matching benefit over `blockhash-v1` on the product corpus

## Initial Baseline Observation

An exploratory BMVB check on one repository image showed zero bit changes for JPEG quality 35 and a
25-percent downscale/upscale, but large distances for cropping, rotation, mirroring, and borders.
This is useful for designing the matrix, not sufficient for selecting an algorithm or threshold.
