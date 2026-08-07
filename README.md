# image-hash

A wrapper around [block-hash](https://github.com/commonsmachinery/blockhash-js) to easily hash a local or remote file with Node.

Supports JPG, PNG and WebP

## Install

```bash
npm i -S image-hash
```

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
