# PDQ Contract Research and Build Readiness

Status: core contract approved; ready for implementation planning
Updated: 2026-08-09

## Purpose

This document records the current PDQ decisions, the primary-source research that supports them,
and the remaining work required to turn the design into an implementation plan. It concerns only
the `image-hash` library. Card detection, crop selection, indexing, and MTG application behavior
remain outside this package.

## Locked Direction

The maintainer has agreed to the following architecture:

- Preserve every existing Block Mean Value serialized hash through a named Promise-based decoder
  policy while replacing the callback-based root API.
- Add PDQ as an opt-in, separately versioned algorithm; never reinterpret a legacy bare hash.
- Build a synchronous TypeScript pixel core shared by Node.js, browsers, and Web Workers.
- Keep paths, URLs, encoded-image decoding, MIME detection, and DOM types out of the core.
- Publish explicit `/core`, `/node`, and `/browser` entrypoints rather than runtime guessing.
- Use Meta C++ as the normative oracle. Use a WASM build from the same pinned source as the primary
  differential/performance comparator and `pdq-wasm` only as a secondary comparator.
- Promise exact equality for identical normalized pixels, not for separately decoded encoded
  images.
- Keep crop selection outside the library. The MTG application can hash both a complete decoded
  image and any cropped pixel region by calling the same pixel API twice.

## Source-Resolved Contract Facts

The normative source snapshot is Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.

| Question | Resolved requirement |
| --- | --- |
| Output | 256 hash bits and an integer quality from 0 through 100 |
| Canonical text | Exactly 64 lowercase hexadecimal characters |
| Minimum size | Width and height must each be at least 5 pixels |
| Luminance | `0.299 R + 0.587 G + 0.114 B`; gray bytes map directly to luminance |
| Downsample | PDQ's two-pass Jarosz filtering and decimation to 64 by 64 |
| Thresholding | Set a bit only when its DCT value is strictly greater than the Torben median |
| Comparison | Hamming distance from 0 through 256; lower is closer |
| Starting policy | Distance at most 31 and quality at least 50, opt-in and benchmark-calibrated |
| Raw conformance | Identical normalized bytes must produce exact hash and quality equality |
| Decoder conformance | Meta's experimental starting gate is quality at least 80 and distance at most 10 from C++ |
| Fixture reuse | Generate local raw vectors; do not copy upstream images without individual provenance review |

Meta returns an all-zero hash and quality 0 for undersized images. The library should instead reject
the input before hashing so an invalid image cannot be stored as a valid-looking fingerprint.

## Approved `pdq-v1` Normalized Pixel Profile

The build plan uses the following frozen profile:

```ts
type PixelSource =
  | { format: 'gray8'; width: number; height: number; data: Uint8Array }
  | { format: 'rgb8'; width: number; height: number; data: Uint8Array }
  | {
      format: 'rgba8';
      width: number;
      height: number;
      data: Uint8Array | Uint8ClampedArray;
    };
```

- Pixels are tightly packed, row-major, left-to-right, and top-to-bottom. V1 has no public stride.
- Dimensions are positive safe integers, each at least 5, and the data length must be exact.
- Channel bytes are interpreted as sRGB-encoded 8-bit values without gamma linearization.
- Raw pixels are already oriented; the core reads no EXIF metadata and performs no rotation.
- `gray8` maps directly to luminance and `rgb8` uses the reference coefficients.
- For `rgba8`, composite each RGB channel over white before luminance using the frozen integer rule
  `floor((channel * alpha + 255 * (255 - alpha) + 127) / 255)`.
- Decoder adapters must supply original dimensions. Browser or decoder resize functions must not
  replace PDQ's own downsample.

White compositing gives transparent pixels a declared visible-background meaning and avoids hashes
depending on hidden RGB values. Changing this rule requires a different algorithm version.

## Approved Fingerprint Record

The algorithm version and record version solve different compatibility problems and should remain
separate:

```ts
type PdqFingerprint = {
  schemaVersion: 1;
  algorithm: 'pdq-v1';
  encoding: 'hex';
  hash: string;
  bitLength: 256;
  quality: number;
};
```

- `algorithm` versions the normalized-pixel-to-fingerprint behavior.
- `schemaVersion` versions the object/JSON envelope.
- `quality` is required for PDQ.
- Parsing may accept uppercase hexadecimal input but canonical output is lowercase.
- A serialized record is valid only when all fixed fields, hash length, and quality range agree.

The existing in-progress `ImageFingerprint` shape uses `bits` and optional `quality`. Before PDQ is
added, change that new/unreleased contract to `bitLength` and a discriminated union so PDQ quality
cannot be absent. Historical hashes migrate through an explicit decoder mode rather than a callback
compatibility surface.

## Comparison and Match Policy

Comparison answers a mathematical question. Matching applies a caller-selected product policy.

```ts
type FingerprintComparison =
  | {
      comparable: true;
      algorithm: 'blockhash-v1' | 'pdq-v1';
      distance: number;
      bitLength: number;
      normalizedDistance: number;
    }
  | {
      comparable: false;
      reason: 'algorithm-mismatch' | 'parameter-mismatch' | 'bit-length-mismatch';
    };

type PdqMatchPolicy = {
  maxDistance: number;
  minQuality: number;
};
```

`normalizedDistance` is `distance / bitLength`; it is not a probability or semantic-similarity
percentage. Low quality does not alter distance. A policy check is eligible only when both PDQ
fingerprints meet `minQuality`.

The library may export an explicitly named starting policy:

```ts
const PDQ_STARTING_POLICY = { maxDistance: 31, minQuality: 50 } as const;
```

It must not be silently applied by `compareFingerprints()`.

## Entry Point Scope

| Entry | First PDQ scope |
| --- | --- |
| `image-fingerprint` | Portable pixel types, synchronous fingerprinting, parsing, serialization, and distance |
| `image-fingerprint/core` | Pixel types, synchronous fingerprinting, validation, parsing, serialization, and distance |
| `image-fingerprint/node` | Root exports plus normalized and historical encoded byte/path fingerprint adapters |
| `image-fingerprint/browser` | Core exports plus `ImageData`, `Blob`, and `File` adapters usable in main thread and workers |

The accepted package ADR exposes named entrypoints plus `package.json` through an `exports` map.
The release gate installs the packed artifact, exercises every public path under CommonJS, ESM, and
TypeScript resolution, and rejects historical internal deep imports.

Browser `ImageData` provides the required tightly packed RGBA order. `Blob` decoding can use
`createImageBitmap` and canvas extraction, but exact encoded-image equality is not promised because
browser color conversion and alpha behavior have implementation-defined defaults. Do not depend on
`imageOrientation: "none"`; current MDN and the living HTML Standard disagree about that value.

## Current Library Decision

No surveyed JavaScript library meets the complete contract:

- `pdq-wasm` is the closest PDQ implementation and supports Node, browsers, workers, quality, and
  Hamming helpers, but requires initialization and a separately hosted/bundled WASM asset. npm
  currently lists 0.3.9 while its repository manifest says 0.3.7.
- `imghash` 1.1.4 is a useful modern Block Mean Value API/package reference, not PDQ.
- `@stabilityprotocol.com/phash` 1.0.0 demonstrates a zero-dependency universal TypeScript pixel
  core, but implements a different DCT hash without PDQ quality or Meta conformance.

Therefore the production target remains a TypeScript port, not a third-party runtime dependency.

## Remaining Research Spikes

Broad architecture research is complete. These bounded spikes remain before or during detailed
implementation planning:

1. **Oracle harness:** build the pinned Meta C++ core with recorded compiler/toolchain flags and a
   raw gray/RGB vector protocol that emits hash plus quality.
2. **Numeric discipline:** determine where TypeScript needs `Math.fround` or `Float32Array` writes
   to reproduce C++ float operation ordering. Exit on exact equality for fixed and seeded vectors.
3. **Package audit:** pack the candidate and published 7.0.1, then test stored-hash migration plus
   `package.json`, root, `/core`, `/node`, and `/browser` in isolated consumers.
4. **Adapter matrix:** choose first-release Node decoders and browser floors; specify EXIF, ICC,
   alpha, animation, maximum dimensions/bytes, abort, redirect, and URL-fetch responsibility.
5. **Performance budget:** record absolute Node and browser budgets on named hardware before using
   WASM results to decide whether an optional backend is needed.
6. **Product corpus:** obtain redistribution-safe MTG positive, negative, full-image, and cropped-
   region pairs to calibrate match policy without putting crop detection into the library.

Items 1–3 are P0 for the TypeScript core. Items 4–6 are P1 for encoded-image adapters and release
calibration; they do not block planning the pure pixel implementation.

## Planning Readiness

The project has enough information to plan and begin the pure PDQ core. The first implementation
milestone should be the oracle harness plus failing conformance tests, followed by the TypeScript core. Encoded-image adapters,
product threshold calibration, and any optional WASM backend should be later milestones with their
own gates.

## Primary Sources

- [Meta PDQ overview and conformance guidance](https://github.com/facebook/ThreatExchange/tree/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/pdq)
- [Meta C++ hashing core](https://github.com/facebook/ThreatExchange/tree/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/pdq/cpp/hashing)
- [Meta C++ hash types](https://github.com/facebook/ThreatExchange/tree/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/pdq/cpp/common)
- [Meta production PDQ signal defaults](https://github.com/facebook/ThreatExchange/tree/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/python-threatexchange/threatexchange/signal_type/pdq)
- [Node.js package entrypoints](https://nodejs.org/api/packages.html#package-entry-points)
- [HTML Standard image data and bitmap processing](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)
- [`pdq-wasm`](https://github.com/Raudbjorn/pdq-wasm)
- [`imghash`](https://github.com/pwlmc/imghash)
- [`@stabilityprotocol.com/phash`](https://www.npmjs.com/package/@stabilityprotocol.com/phash)
