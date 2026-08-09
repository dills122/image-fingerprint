# image-hash

A compatibility wrapper around
[block-hash](https://github.com/commonsmachinery/blockhash-js), plus a runtime-neutral pixel API for
building deterministic image fingerprints in Node.js and browsers.

The legacy Node.js adapter supports JPG, PNG and WebP. The browser and core entrypoints accept
decoded, tightly packed RGBA pixels so fingerprint algorithms remain independent of runtime I/O and
image decoders.

## Install

```bash
npm i -S image-hash
```

## Entrypoints

| Import | Runtime | Purpose |
| --- | --- | --- |
| `image-hash` | Node.js | Existing callback API plus the portable pixel API |
| `image-hash/node` | Node.js | Explicit Node.js entrypoint for paths, URLs, and buffers |
| `image-hash/core` | Node.js or browser | Runtime-neutral pixel fingerprinting |
| `image-hash/browser` | Browser | Browser-safe ESM entrypoint; currently accepts decoded pixels |

The root entrypoint remains Node.js-compatible so existing `require('image-hash')` consumers retain
their current behavior. Browser applications should use `image-hash/browser` and Node applications
may use either the root or explicit Node.js entrypoint.

## Cross-runtime pixel API

The same decoded pixels produce the same versioned fingerprint in Node.js and browsers:

```typescript
import { fingerprintPixels } from 'image-hash/browser';

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

Existing BlockHash callers may continue to pass an untagged positive integer `width` and `height`
with exactly `width * height * 4` row-major RGBA8 values in a `Uint8Array` or
`Uint8ClampedArray`. They may also add `format: 'rgba8'`; tagged input requires each dimension to be
at least 5 pixels and produces the identical BlockHash result from the same bytes.

The portable core also defines the tagged `PixelSource` contract for the forthcoming `pdq-v1` API:
tightly packed `gray8` and `rgb8` use `Uint8Array`, while straight-alpha `rgba8` accepts
`Uint8Array` or `Uint8ClampedArray`. Tagged dimensions are positive safe integers of at least 5
pixels and packed lengths must be exact. `gray8` and `rgb8` are not BlockHash inputs; they become
callable when the separate PDQ dispatcher is implemented.

For `blockhash-v1`, `bitsPerSide` must be a positive even integer no larger than either image
dimension, and `method` must be `1` (quick) or `2` (precise). The returned `bitLength` is
`bitsPerSide ** 2`. Pixel values are interpreted as sRGB with straight alpha. PDQ-tagged `rgba8`
normalization composites over white with the versioned deterministic rule documented in the
[modernization contract](./docs/modernization/pdq-contract-research.md); encoded-image adapters
remain responsible for producing correctly oriented original-size pixels.

Encoded-image decoding is deliberately outside this core boundary. Browser `File`, `Blob`, URL,
orientation, alpha, and color-normalization adapters will be added against the same
contract; this separation also gives the planned `pdq-v1` implementation one portable input.

## Use

```javascript
const { imageHash }= require('image-hash');

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
- Opt-in live network tests: `pnpm test:network`

## Credit

The hard bit of this comes with thanks from [commonsmachinery](https://github.com/commonsmachinery) for [blockhash-js](https://github.com/commonsmachinery/blockhash-js)

## License

Distributed under an MIT license
