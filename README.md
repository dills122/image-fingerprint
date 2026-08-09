# image-fingerprint

A versioned image-fingerprinting library with a runtime-neutral pixel core, Node.js and browser
image adapters, PDQ matching tools, and exact migration support for hashes created by
[`image-hash@7`](https://github.com/danm/image-hash).

Node and browser adapters prepare static JPEG, PNG, and WebP images for the same decoded-pixel
fingerprint core.

> [!NOTE]
> Existing `image-hash@7` values remain reproducible through the explicit Node-only
> `decoderMode: 'image-hash-v7'` policy. New encoded-image calls default to normalized decoding.
> Decoder mode is part of reproducibility and should be stored with fingerprints derived from
> encoded images.

## Install

```bash
npm install image-fingerprint
```

## Entrypoints

| Import | Runtime | Purpose |
| --- | --- | --- |
| `image-fingerprint` | Node.js | Portable pixel fingerprint, codec, comparison, and policy APIs |
| `image-fingerprint/node` | Node.js | Normalized and historical encoded-image policies, paths, file URLs, bytes, and pixel APIs |
| `image-fingerprint/core` | Node.js or browser | Runtime-neutral pixels, regions, decoder contracts, and fingerprinting |
| `image-fingerprint/browser` | Browser or worker | Native `Blob`, `File`, `ImageData`, and pixel APIs |

Browser applications should use `image-fingerprint/browser`. Node applications should use the
explicit Node entrypoint for encoded images.

## Cross-runtime pixel API

The same decoded pixels produce the same versioned fingerprint in Node.js and browsers:

```typescript
import { fingerprintPixels } from 'image-fingerprint/browser';

const context = canvas.getContext('2d');
if (!context) throw new Error('2D canvas is unavailable');

const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
const fingerprint = fingerprintPixels(pixels, {
  algorithm: 'blockhash-v1',
  bitsPerSide: 16,
  method: 2,
});

console.log(fingerprint);
// {
//   schemaVersion: 1,
//   algorithm: 'blockhash-v1',
//   encoding: 'hex',
//   hash: '...',
//   bitLength: 256,
//   parameters: { bitsPerSide: 16, method: 2 },
// }
```

PDQ is opt-in through the same synchronous pixel API:

```typescript
import { fingerprintPixels } from 'image-fingerprint/core';

const fingerprint = fingerprintPixels({
  format: 'rgba8',
  width,
  height,
  data: rgbaBytes,
}, {
  algorithm: 'pdq-v1',
});

// {
//   schemaVersion: 1,
//   algorithm: 'pdq-v1',
//   encoding: 'hex',
//   hash: '...', // 64 lowercase hexadecimal characters
//   bitLength: 256,
//   quality: 0, // integer from 0 through 100
// }
```

Existing BlockHash callers may continue to pass an untagged positive integer `width` and `height`
with exactly `width * height * 4` row-major RGBA8 values in a `Uint8Array` or
`Uint8ClampedArray`. They may also add `format: 'rgba8'`; tagged input requires each dimension to be
at least 5 pixels and produces the identical BlockHash result from the same bytes.

For `pdq-v1`, the tagged `PixelSource` contract accepts tightly packed `gray8` and `rgb8` in a
`Uint8Array`, while straight-alpha `rgba8` accepts `Uint8Array` or `Uint8ClampedArray`. Dimensions
are positive safe integers of at least 5 pixels and packed lengths must be exact. `gray8` and
`rgb8` remain invalid BlockHash inputs.

For `blockhash-v1`, `bitsPerSide` must be a positive even integer no larger than either image
dimension, and `method` must be `1` (quick) or `2` (precise). The returned `bitLength` is
`bitsPerSide ** 2`. Pixel values are interpreted as sRGB with straight alpha. PDQ-tagged `rgba8`
normalization composites over white with the versioned deterministic rule documented in the
[modernization contract](./docs/modernization/pdq-contract-research.md); encoded-image adapters
remain responsible for producing correctly oriented original-size pixels.

`pdq-v1` returns a 256-bit perceptual hash and required integer quality from 0 through 100. Quality
describes the image's information content; it is not a similarity score. Hamming comparison,
quality policy, and match thresholds remain explicit later API layers rather than hidden behavior
inside fingerprint generation. PDQ is a copy-similarity signal, not a cryptographic hash.

The production PDQ backend is portable TypeScript. A pinned same-source WASM comparator remained
exact but did not meet the predeclared cross-runtime performance rule, so no WASM asset is shipped
or selected at runtime. See the [performance report](./docs/modernization/pdq-performance-results.md)
for Node/browser latency, worker responsiveness, memory, artifact size, and limitations.

### Store and restore fingerprints

Use the codec helpers when persisting a fingerprint or reading one from an untrusted store:

```typescript
import {
  parseFingerprint,
  serializeFingerprint,
} from 'image-fingerprint/core';

const serialized = serializeFingerprint(fingerprint);
const restored = parseFingerprint(serialized);
```

`parseFingerprint` accepts one schema-versioned JSON record and rejects missing, unknown, or
inconsistent fields. Uppercase hexadecimal input is accepted for interoperability, while parsed
records and `serializeFingerprint` output always use canonical lowercase hexadecimal. Serialization
also revalidates its input at runtime. BlockHash records must carry the method and `bitsPerSide`
that agree with their bit length and hexadecimal hash length.

### Compare fingerprints and apply policy

`compareFingerprints` reports mathematical Hamming distance only. Incompatible algorithms,
BlockHash parameters, or bit lengths produce an explicit non-comparable result:

```typescript
import {
  compareFingerprints,
  evaluatePdqMatch,
  PDQ_STARTING_POLICY,
} from 'image-fingerprint/core';

const comparison = compareFingerprints(firstFingerprint, secondFingerprint);
if (comparison.comparable) {
  console.log(comparison.distance);
  console.log(comparison.normalizedDistance); // distance / bitLength
} else {
  console.log(comparison.reason);
}

const policyResult = evaluatePdqMatch(
  firstPdqFingerprint,
  secondPdqFingerprint,
  PDQ_STARTING_POLICY,
);
```

`PDQ_STARTING_POLICY` is the explicit `{ maxDistance: 31, minQuality: 50 }` starting point from the
PDQ ecosystem; it is never applied automatically. `evaluatePdqMatch` requires a policy argument.
Both fingerprints must meet its minimum quality before the result is eligible, while the underlying
distance remains unchanged. Product thresholds should be calibrated against representative data.
`normalizedDistance` is not a probability or semantic-similarity percentage.

Real-camera MTG calibration reinforces that boundary: unrectified full camera frames were not a
usable standalone PDQ input, and axis-aligned card regions still had substantial positive/negative
overlap. Use PDQ as a conservative candidate or ranking signal after consistent normalization, and
do not treat a distance above 31 as proof that two camera captures differ. See the
[MTG matching report](./docs/modernization/pdq-matching-results.md) for the corpus, measured tradeoffs,
rights boundary, and exact-printing limitations.

## Decode once, fingerprint many

Node and browser adapters implement the same runtime-neutral decoder contract from
`image-fingerprint/core`. Both return tightly packed, oriented, sRGB, straight-alpha RGBA8 pixels. The Node
adapter accepts a path, `file:` URL, or encoded `Uint8Array`; the browser adapter accepts `Blob`,
`File`, or `ImageData`. Remote URL fetching is not part of the new API.

```typescript
import {
  decodeImage,
  extractPixelRegion,
  fingerprintPixels,
  type PixelSource,
} from 'image-fingerprint/browser';

const pixels = await decodeImage(file, {
  signal,
  limits: {
    maxEncodedBytes: 16 * 1024 * 1024,
    maxPixels: 24_000_000,
  },
});

const fingerprint = (source: PixelSource) => fingerprintPixels(source, {
  algorithm: 'pdq-v1',
});

const fingerprints = {
  full: fingerprint(pixels),
  artwork: fingerprint(extractPixelRegion(pixels, {
    x: artwork.x,
    y: artwork.y,
    width: artwork.width,
    height: artwork.height,
  })),
};
```

Regions use integer coordinates in the already-oriented image, must be fully in bounds, and are
copied into a new tightly packed buffer. The helper does not detect, clamp, pad, or resize crops.
Each region dimension must be at least 5 pixels.

For a single encoded-image fingerprint:

```typescript
import { fingerprintImage } from 'image-fingerprint/node';

const fingerprint = await fingerprintImage('./scan.jpg', {
  algorithm: 'pdq-v1',
  signal,
});
```

BlockHash uses the same Promise-based flow and returns a versioned record:

```typescript
import { fingerprintImage } from 'image-fingerprint/node';

const fingerprint = await fingerprintImage('./scan.jpg', {
  algorithm: 'blockhash-v1',
  bitsPerSide: 16,
  method: 2,
});
```

> [!WARNING]
> The same encoded image is **not guaranteed to produce the same fingerprint in Node.js and every
> browser**. Sharp and browser engines can decode, color-convert, orient, and round pixels
> differently—especially for ICC/wide-gamut color profiles and alpha. `fingerprintPixels()` is
> exact for identical normalized pixels, and repeated decodes were stable in the measured
> configurations, but separately decoded encoded files may have a nonzero Hamming distance.

The default limits are 32 MiB encoded and 40 million decoded pixels. Static JPEG, PNG, and WebP are
supported; animated inputs are rejected explicitly. Preparation failures are
`ImagePreparationError` values with stable `code` fields documented in
[ADR 0003](./docs/architecture/0003-runtime-image-decoder-contract.md).

When fingerprints cross runtime or browser boundaries:

- Do not require fingerprint string equality for independently decoded encoded images. Use
  `compareFingerprints()` or `evaluatePdqMatch()` with a policy calibrated on representative images.
- If exact reproducibility is required, normalize and hash through one controlled decoder pipeline,
  and retain that decoder/configuration version with persisted fingerprints.
- Recalibrate before changing decoder versions or relying on wide-gamut/ICC-heavy inputs. The
  current small conformance corpus found exact repeats within each decoder but a browser-specific
  Display P3 result at Hamming distance 12 from the Node/Sharp reference.
- Persist a decoder/normalization identifier next to any fingerprint that must be reproduced from
  encoded bytes. The fingerprint record describes the algorithm, not the decoder pipeline.

See the [encoded-image adapter conformance report](./docs/modernization/pdq-adapter-conformance.md)
for the measured Node, Chromium, Firefox, and WebKit results and corpus limitations. These
cross-decoder measurements are compatibility evidence, not a universal application threshold.

### Reproduce image-hash@7 BlockHash values

Sharp and the historical `jpeg-js` decoder are not byte-equivalent. A generated differential run
found 98 different BlockHash values in 720 Sharp-vs-historical comparisons, all on JPEG. Therefore
historical decoding is an explicit policy rather than an alias for normalized decoding:

```typescript
import { fingerprintImage } from 'image-fingerprint/node';

const migrated = await fingerprintImage('./existing-image.jpg', {
  algorithm: 'blockhash-v1',
  bitsPerSide: 16,
  method: 2,
  decoderMode: 'image-hash-v7',
});

console.log(migrated.hash); // compatible with image-hash@7 using 16 bits and precise=true
```

`decoderMode` is intentionally a named, versioned value rather than a boolean. It is Node-only and
valid only with `blockhash-v1`; PDQ always uses normalized decoding. Omit the option for the modern
Sharp policy, which applies EXIF orientation and converts to sRGB before hashing. Do not mix values
from the two policies in an equality-based stored-hash index.

Migration mappings are direct: old `bits` becomes `bitsPerSide`, `precise: true` becomes method 2,
and `precise: false` becomes method 1. Pass a former local path directly or pass the encoded
`Buffer`/`Uint8Array`. Remote fetching and request policy now belong to the application; pass the
resulting encoded bytes to `fingerprintImage()`.

## Development

The project uses Node.js 22.14 or newer, TypeScript, ESLint, Vitest, and pnpm. Node 24 is the
recommended development runtime; pnpm is pinned through `packageManager`.

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs linting, strict typechecking, offline tests with coverage floors, a build, and
isolated CommonJS, ESM, and TypeScript checks against the packed tarball.

Install Playwright's matched engines once, then run the opt-in real-browser and module-worker gate:

```bash
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
```

Reusable Codex guidance is linked from the sibling `ai-central` checkout. Refresh those local links
with `pnpm codex:links`, or set `AI_CENTRAL_HOME` if that checkout lives elsewhere. See
[`.codex/AI_CENTRAL.md`](./.codex/AI_CENTRAL.md) for the selected profiles and bundles.

Research and gated planning for modern image fingerprints lives in
[`docs/modernization/`](./docs/modernization/). The proposed compatibility contract for adding
algorithms is recorded in
[`docs/architecture/0001-versioned-image-fingerprints.md`](./docs/architecture/0001-versioned-image-fingerprints.md).

## Testing

- Offline unit/integration suite: `pnpm test`
- Full local quality gate: `pnpm check`
- Published file-set verification: `pnpm pack:check`
- Packed Chromium, Firefox, WebKit, and module-worker conformance: `pnpm test:browser`
- Historical BlockHash differential matrix: `pnpm compat:image-hash-v7`

## Releasing

The repository must have an `NPM_TOKEN` Actions secret with permission to publish
`image-fingerprint`. Update the version in `package.json`, merge that change, then push a matching
tag such as `v0.1.0`. The release workflow verifies the tag and package, publishes to npm with
provenance, and creates a GitHub release containing the npm tarball.

## Origins and attribution

`image-fingerprint` began as a port of Daniel Morrison's
[`image-hash`](https://github.com/danm/image-hash), with its history and contributors preserved for
attribution. The Block Mean Value implementation ultimately derives from
[`blockhash-js`](https://github.com/commonsmachinery/blockhash-js) by Commons Machinery.

This is a new package with its own API and release history. The Node-only `image-hash-v7` decoder
mode deliberately preserves historical stored-hash compatibility without retaining the old
callback or remote-request API.

## License

Distributed under an MIT license
