# PDQ Reference Material

Status: researched reference baseline
Updated: 2026-08-09

## Reference Position

PDQ does not have a standards-body or standalone normative specification. For this project, the
algorithm is defined operationally by Meta's documentation, canonical source, and regression data,
in that order of purpose:

| Priority | Reference | Use |
| --- | --- | --- |
| 1 | [PDQ whitepaper](https://github.com/facebook/ThreatExchange/blob/main/hashing/hashing.pdf) | Algorithm intent, stages, quality measure, evaluation, and limitations |
| 2 | [C++ hashing core](https://github.com/facebook/ThreatExchange/tree/main/pdq/cpp/hashing) | Canonical numeric behavior, transforms, bit thresholding, and quality |
| 3 | [C++ hash type](https://github.com/facebook/ThreatExchange/tree/main/pdq/cpp/common) | 256-bit layout, Hamming distance, and hex serialization |
| 4 | [Java implementation](https://github.com/facebook/ThreatExchange/tree/main/pdq/java) | Readable, decoder-independent raw-pixel implementation suitable for porting |
| 5 | [PDQ regression data](https://github.com/facebook/ThreatExchange/tree/main/pdq/data) | Cross-implementation fixtures, EXIF cases, and expected behavior |
| 6 | [`python-threatexchange` PDQ signal](https://github.com/facebook/ThreatExchange/tree/main/python-threatexchange/threatexchange/signal_type/pdq) | Current matching and quality threshold conventions |
| 7 | [MIH notes](https://github.com/facebook/ThreatExchange/blob/main/pdq/README-MIH.md) | Optional large-scale Hamming-index design |

Source inspection for this spike was pinned to Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424` so implementation work can reproduce the reference
state rather than float with `main`.

Meta publishes the ThreatExchange code under its BSD license. The C++ image I/O example uses CImg,
which Meta explicitly identifies as separately licensed and confined to the I/O layer. A port should
reference or reuse the algorithm core without importing CImg.

The general code license does not establish unrestricted reuse for every included image. Meta's
WASM documentation limits its bundled images to open-source testing and requires separate
authorization for other uses. Permanent package fixtures should therefore be synthetic or have
individual provenance and redistribution records.

## Algorithm Contract

Given decoded RGB or grayscale pixels:

1. Convert RGB to luminance with `0.299 R + 0.587 G + 0.114 B`.
2. Apply two separable Jarosz/tent-filter passes while downsampling to a 64 by 64 luminance buffer.
3. Compute a 0-100 quality score from the quantized sum of absolute horizontal and vertical
   gradients. The C++ core divides by 90 and caps the result at 100.
4. Apply a 2D DCT and retain frequency positions 1 through 16 on each axis, excluding the DC row
   and column.
5. Compute the Torben median of the 16 by 16 DCT result.
6. In row-major order, set bit `i * 16 + j` only when that component is strictly greater than the
   median.
7. Serialize the 16 internal 16-bit words from index 15 down to index 0 as 64 lowercase hex digits.

The result is a 256-bit fingerprint plus quality. Matching is Hamming distance, where lower means
more similar.

Both dimensions must be at least 5. The C++ reference emits an all-zero hash and quality 0 below
that boundary; this library will reject undersized inputs before hashing so they cannot be mistaken
for valid fingerprints.

## Operational Defaults

Meta's current starting guidance is:

- consider hashes a match at Hamming distance `<= 31`
- discard hashes with quality `<= 49`, equivalent to accepting quality `>= 50`

These are initial operating points, not universal truth. Product data should calibrate thresholds
and report precision/recall around the selected boundary.

## Conformance Model

Meta notes that image decoders vary across languages and platforms. Its experimental correctness
guidance separates two levels:

1. The same raw pixel arrays must produce the exact C++ reference hash.
2. Independently decoded images with quality at least 80 should be within Hamming distance 10 of the
   C++ result.

This project should strengthen that guidance with:

- exact raw-pixel hash and quality vectors
- exact 64-character lowercase serialization and round-trip parsing
- Hamming distance symmetry, identity, and boundary tests
- decoded JPEG, PNG, WebP, grayscale, alpha, EXIF orientation, and dimension fixtures
- differential testing against a pinned Meta build
- deterministic output across supported Node versions and CPU architectures

## Known Limits

- PDQ detects copies and ordinary edits; it does not establish semantic equivalence.
- Deep cropping is outside the whitepaper's intended robustness envelope.
- The eight dihedral transforms are useful, but a lexicographic-minimum canonical hash is not
  guaranteed to remain identical across rotations.
- Adversarial resistance is not a guarantee; thresholds and abuse/security use cases require
  separate threat analysis.
- Large-scale lookup via MIH or FAISS is orthogonal to generating a fingerprint.

## Implementation Reference Choice

Use the Java `PDQHasher` as the clearest porting narrative because it operates entirely on RGB or
grayscale matrices and has no image-format dependencies. Resolve numeric or serialization questions
against the C++ core and hash type. Validate both against the regression data and a pinned reference
binary.

A third-party Node/WASM implementation may be used for a comparative spike, but it is not a
normative reference. It must pass the same raw-pixel and decoded-image conformance suite before a
dependency decision.

## Shipped Attribution and Decoder Boundary

The production TypeScript port is validated against Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`; the same-source C++ and WASM comparators are development
evidence and are not shipped in the npm tarball. The repository's synthetic PDQ vectors and encoded
adapter corpus record generation provenance, checksums, and licenses alongside the fixtures.

BlockHash lineage remains attributed to Commons Machinery's `blockhash-js`. Historical encoded
compatibility uses the same `jpeg-js`, `pngjs`, and `@cwasm/webp` package families used by
`image-hash@7`; no decoder implementation is copied into this repository. Normalized Node decoding
uses pinned `sharp@0.35.3`. These decoder choices are preprocessing contracts, not part of Meta's
PDQ algorithm definition.
