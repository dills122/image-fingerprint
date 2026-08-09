# image-fingerprint

A compatibility wrapper around
[block-hash](https://github.com/commonsmachinery/blockhash-js), plus a runtime-neutral pixel API for
building deterministic image fingerprints in Node.js and browsers.

The legacy Node.js adapter supports JPG, PNG and WebP. The browser and core entrypoints accept
decoded, tightly packed gray, RGB, or RGBA pixels so fingerprint algorithms remain independent of
runtime I/O and image decoders.

> [!NOTE]
> This package has not been released yet. The legacy Node implementation remains temporarily as a
> compatibility oracle while the portable implementation is checked against it. The legacy-only
> surface will be removed before the first release; `image-fingerprint` does not continue the
> `image-hash` version line.

## Install

```bash
npm install image-fingerprint
```

## Entrypoints

| Import | Runtime | Purpose |
| --- | --- | --- |
| `image-fingerprint` | Node.js | Existing callback API plus the portable pixel API |
| `image-fingerprint/node` | Node.js | Explicit Node.js entrypoint for paths, URLs, and buffers |
| `image-fingerprint/core` | Node.js or browser | Runtime-neutral pixel fingerprinting |
| `image-fingerprint/browser` | Browser | Browser-safe ESM entrypoint; currently accepts decoded pixels |

The root entrypoint remains Node.js-compatible while the legacy implementation is retained as a
parity oracle. Browser applications should use `image-fingerprint/browser` and Node applications
may use either the root or explicit Node.js entrypoint during the pre-release period.

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

Encoded-image decoding is deliberately outside this core boundary. Browser `File`, `Blob`, URL,
orientation, alpha, and color-normalization adapters will be added against the same contract.

## Use

```javascript
const { imageHash } = require('image-fingerprint');

// remote file simple
imageHash('https://ichef-1.bbci.co.uk/news/660/cpsprodpb/7F76/production/_95703623_mediaitem95703620.jpg', 16, true, (error, data) => {
  if (error) throw error;
  console.log(data);
  // 0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0
});

// remote file with fetch config object
const config = {
  url: 'https://ichef-1.bbci.co.uk/news/660/cpsprodpb/7F76/production/_95703623_mediaitem95703620.jpg'
};

imageHash(config, 16, true, (error, data) => {
  if (error) throw error;
  console.log(data);
  // 0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0
});

//local file
imageHash('./_95695590_tv039055678.jpg', 16, true, (error, data) => {
  if (error) throw error;
  console.log(data);
  // 0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0
});

//Buffer
const fBuffer = fs.readFileSync(__dirname + '/example/_95695591_tv039055678.jpeg');
imageHash({
  ext: 'image/jpeg',
  data: fBuffer
}, 16, true, (error, data) => {
  if(error) throw error;
  console.log(data);
  // 0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0
});

//Buffer, without ext arg
const fBuffer = fs.readFileSync(__dirname + '/example/_95695591_tv039055678.jpeg');
imageHash({
  data: fBuffer
}, 16, true, (error, data) => {
  if(error) throw error;
  console.log(data);
  // 0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0
});
```

## API

```typescript
// name
imageHash(location, bits, precise, callback);

// types
imageHash(string|object, int, bool, function);
```

## SETTINGS
Image hash will log out warnings if environment variable `VERBOSE` is set to true.


### Image-Hash Arguments

| Argument | Type | Description | Mandatory | Example |
| -------- | ---- | ----------- | --------- | ------- |
| location | `object` or `string` | A configuration object with a remote `url` (see below for details), `Buffer` object (See input types below for more details), or `String` with a valid url or file location | Yes | see above |
| bits | `int` | The number of bits in a row. The more bits, the more unique the hash. | Yes | 8 |
| precise  | `bool` | Whether a precision algorithm is used. `true` Precise but slower, non-overlapping blocks. `false` Quick and crude, non-overlapping blocks. Method 2 is recommended as a good tradeoff between speed and good matches on any image size. The quick ones are only advisable when the image width and height are an even multiple of the number of blocks used. | Yes | `true` |
| callback | `function` | A function with `error` and `data` arguments - see below |

#### Location Object Types

```typescript
// Url Request Object
interface UrlRequestObject extends RequestInit {
  encoding?: string | null,
  url: string | null,
};

// Buffer Object
interface BufferObject {
  ext?: string, // mime type of buffered file
  data: Buffer,
  name?: string // file name for buffered file
};
```

### Callback Arguments

| Argument | Type                     | Description                                                                         |
| -------- | ------------------------ | ----------------------------------------------------------------------------------- |
| error    | `Error Object` or `null` | If a run time error is detected this will be an `Error Object`, otherwise `null`    |
| data     | `string` or `null`       | If there is no run time error, this be will be your hashed result, otherwise `null` |

## Development

The project uses Node.js 22.14 or newer, TypeScript, ESLint, Vitest, and pnpm. Node 24 is the
recommended development runtime; pnpm is pinned through `packageManager`.

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs linting, strict typechecking, offline tests with coverage floors, a build, and a
smoke test against the packaged CommonJS entrypoint. Live remote-input tests are intentionally
separate and can be run with `pnpm test:network`.

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
- Opt-in live network tests: `pnpm test:network`

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

This is a new package with its own API and release history. Compatibility with legacy
`image-hash` output is used as a migration invariant, not as a commitment to retain its Node-only
API.

## License

Distributed under an MIT license
