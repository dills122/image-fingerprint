# Image Hashing Modernization Findings

Updated: 2026-08-07

## Repository Baseline

- The package is a Node.js/TypeScript wrapper around a Block Mean Value hash implementation.
- `src/index.ts` currently combines input loading, MIME detection, decoding, and hashing.
- The public API is callback-based and accepts paths, remote URLs/request objects, and buffers.
- Golden tests encode exact legacy 256-bit BMVB strings. These are compatibility contracts.
- The current decoder stack is `jpeg-js`, `pngjs`, and `@cwasm/webp`.
- Remote tests depend on live BBC URLs and should not be the only compatibility evidence.
- `file-type@21` implies a modern Node runtime even though `package.json` does not declare engines.

## PDQ Reference Hierarchy

There is no independent normative PDQ standard. The strongest practical reference set is:

1. Meta's PDQ whitepaper for algorithm intent, stages, evaluation, quality, and limitations.
2. Meta's C++ implementation for canonical numeric and serialization behavior.
3. Meta's Java implementation for a readable raw-pixel core independent of image formats.
4. Meta's regression fixtures and expected outputs for conformance.
5. `python-threatexchange` for current matching and quality threshold defaults.

The inspected Meta ThreatExchange revision was
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.

## Algorithm Facts

- PDQ emits a 256-bit perceptual hash and a quality score from 0 through 100.
- RGB luminance uses `0.299 R + 0.587 G + 0.114 B`.
- Two Jarosz-filter passes downsample luminance to 64 by 64.
- Quality is derived from horizontal and vertical gradients, scaled and capped at 100.
- A 2D DCT retains a 16 by 16 block of non-DC frequency components.
- A bit is set when the row-major DCT component is strictly greater than the Torben median.
- Internal bit `i * 16 + j` maps through reversed 16-bit words when formatted as 64 hex digits.
- Similarity is Hamming distance. Meta recommends starting with distance at most 31.
- Meta's production signal discards quality below 50.

## Conformance Implications

- Encoded-image decoders can produce platform variance. Meta's current guidance accepts exact hash
  equality for identical raw pixel arrays and distance at most 10 from C++ for decoded images with
  quality at least 80.
- The raw-pixel algorithm and the image decoder must therefore be separate tested boundaries.
- Fixture tests should cover hash, quality, bit order, alpha policy, EXIF orientation, grayscale,
  resize, and all eight dihedral transforms.
- Exact raw-pixel vectors should be the primary porting contract; decoded-image tolerance is a
  secondary integration contract.

## Capability Boundaries

- PDQ is for syntactic/copy similarity, not semantic similarity.
- It is robust to ordinary recompression, resizing, and light overlays, but it is a global
  descriptor and is not designed for deep crops.
- Eight dihedral hashes can be computed cheaply, but selecting a single lexicographic minimum is
  not guaranteed to be exactly rotation-invariant.
- Crop-resistant regional hashes or an embedding model such as SSCD are separate later candidates
  if the product requires crop or semantic robustness.
- MIH/FAISS indexing is a storage/search concern and is not required for the first hashing API.

## Implementation Candidates

- A TypeScript port from the Java/C++ raw-pixel core offers auditability and portable packaging,
  but must prove numerical conformance and performance.
- A WASM build of the Meta core offers closeness to the canonical implementation, but adds build,
  binary, memory-copy, and packaging complexity.
- A third-party package such as `pdq-wasm` can accelerate a spike, but its behavior and provenance
  must be audited against Meta fixtures before it becomes a production dependency.
- Meta's own WASM directory is a useful build/demo reference, not a polished drop-in npm package.

## AI Central Integration

- Link mode is used so repo-specific policy is reviewable while shared skills stay centralized.
- Profiles: `base`, `javascript-typescript`.
- Bundles: `core`, `planning`, `workflow`.
- Reviewed AI Central revision: `0248f5b22ec1b5e53b0c5c3be39d150932e0821d`.
