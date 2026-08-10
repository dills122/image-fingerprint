# Crop-Block v1 Research

Status: experiment input; public profile not frozen
Updated: 2026-08-09
Baseline: `a93b564e18e4121d28dfe2e5661e83d110ac2bde`

## Outcome

Cropping resistance should be evaluated as a variable-length collection of region fingerprints.
The difficult contract is deterministic segmentation and set comparison, not invoking BlockHash.
No external implementation supplies a canonical byte-level `crop-block-v1` specification, so this
package must select, version, and test its own profile before exporting it.

## Lineage

Steinebach, Liu, and Yannikos, *Efficient Cropping-Resistant Robust Image Hashing* (ARES 2014,
DOI `10.1109/ARES.2014.85`) combines segmentation with efficient block-mean hashing. Its published
record establishes the design lineage but not a complete interoperable serialization profile.

Python ImageHash provides useful BSD-2-Clause executable prior art. It converts to Pillow `L`,
resizes to 300 square, applies Gaussian and median filters, thresholds strictly above 128, finds
four-connected bright and dark components, retains area strictly above 500, maps component boxes to
the original image, and hashes those crops. It defaults to dHash rather than BlockHash. Its own note
about Pillow rounding changing segmentation is direct evidence that preprocessing belongs to the
versioned identity. Its default nearest-region comparison is directional, permits target reuse,
and is not a metric.

The MIT-licensed `imagehash-web` port demonstrates browser feasibility but intentionally differs in
resampling and smoothing and warns that browser/Pillow results can differ. It is comparison material,
not an oracle. Newer crop-and-rotation work adds instance segmentation and orientation normalization;
that model-heavy design is outside this dependency-light v1 experiment.

## Proposed Differences

- Use the repository's deterministic straight-alpha-over-white RGBA normalization.
- Compare two independently specified pure-TypeScript preprocessing candidates.
- Use iterative typed-array four-connectivity, never recursion or coordinate sets.
- Hash each accepted original-pixel box with exact `blockhash-v1` 16/2.
- Canonically order and cap regions.
- Compare full pairwise distances with directed, mutual, and one-to-one strategies.
- Return explicit pair/coverage evidence instead of a fabricated global distance.

This is a library-defined profile. It must not be described as a true watershed implementation or
as bit-compatible with ImageHash.

## API And Schema Problem

Current schema-v1 records require one top-level fixed-length hexadecimal hash. A crop-aware result
has changing segment count and order after crops; concatenation would destroy segment boundaries and
make valid partial comparisons impossible. The public result therefore needs an explicit segment
array and algorithm-specific comparison evidence. Whether that is a schema-v1 union extension or a
new envelope remains an approval decision. The experiment deliberately does not modify public
types, dispatch, codec, or exports.

## Determinism And Resource Risks

Resize coordinates, coefficients, intermediate rounding, edge extension, luminance rounding,
threshold equality, connectivity, component area, half-open mapping, caps, duplicate handling, and
sort tie-breaks all affect identity. Candidate code fixes each choice and uses bounded typed arrays.
The production profile must cap segments and validate persisted counts before allocating an
O(querySegments × candidateSegments) comparison matrix.

Fallback-to-full-image preserves a result for flat images but can create generic matches. The study
therefore reports fallback rate and compares fallback eligibility. Perceptual hashes remain
non-cryptographic and can be defeated by region splitting, overlays, removal, inpainting, rotation,
perspective, and threshold-boundary edits.

## Licensing And Provenance

The implementation is clean-room TypeScript from described behavior. No upstream code or images are
copied. Python ImageHash is BSD-2-Clause and imagehash-web is MIT; their commits and notices must be
reviewed again if code is later adapted. Default fixtures are synthetic and generated locally with
recorded parameters. Real-image claims require separately approved redistribution provenance.
