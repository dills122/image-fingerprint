# ADR 0003: Runtime Image Decoder Contract

Status: accepted
Updated: 2026-08-09

## Context

The portable fingerprint core accepts normalized pixels, while applications commonly begin with a
path, encoded bytes, `Blob`, `File`, or `ImageData`. The MTG scanning consumer must decode once and
fingerprint both the oriented full image and caller-selected regions without coupling PDQ to a
decoder.

Node.js and browsers cannot share a decoder implementation, but they can share input limits, output
pixels, cancellation, errors, and Promise-based orchestration. The existing `imageHash()` callback
path and its format-specific decoders remain compatibility-locked.

## Decision

- `image-fingerprint/core` owns the runtime-neutral `ImageDecoder<Source>` contract, decode options,
  default limits, stable preparation errors, and `extractPixelRegion()`.
- `image-fingerprint/node` accepts filesystem paths, `file:` URLs, and encoded `Uint8Array` values. It uses
  exactly `sharp@0.35.3`, loaded only when decoding is requested.
- `image-fingerprint/browser` accepts `Blob`, `File`, and `ImageData`. It uses `createImageBitmap` plus an
  sRGB `OffscreenCanvas`, with a document canvas fallback on the main thread.
- Both encoded adapters support only static JPEG, PNG, and WebP. APNG and animated WebP are rejected
  before a runtime can select an implicit frame.
- Encoded orientation is applied, original oriented dimensions are retained, and output is tightly
  packed sRGB RGBA8 with straight alpha. Neither adapter resizes before fingerprinting.
- The default limits are 32 MiB of encoded input and 40 million decoded pixels. Callers can lower or
  explicitly raise either positive-integer limit.
- `fingerprintImage()` is initially PDQ-only and must equal `fingerprintPixels(await
  decodeImage(source), { algorithm: 'pdq-v1' })`.
- New remote URL fetching is not included. It remains available only through the legacy callback
  API until separately specified.

## Stable Errors

Adapters throw `ImagePreparationError` with one of these codes:

- `invalid-input`
- `input-read-failed`
- `unsupported-format`
- `animated-image`
- `limit-exceeded`
- `decode-failed`
- `aborted`
- `unsupported-runtime`

Translated errors retain their original `cause`. Callers branch on `code`, not human-readable
messages.

Abort is cooperative. Reads and asynchronous decoder work reject promptly and release resources;
an underlying browser or native operation can finish after rejection. The synchronous PDQ core
cannot be interrupted after it starts, so browser applications requiring responsive cancellation
should run decode-and-hash work in a worker.

## Package And Size Boundary

The package declares `sideEffects: false`. `/core` and `/browser` have separate ESM graphs that must
contain no Sharp, Node.js built-ins, or legacy decoder dependencies. `/node` is a separate CommonJS-
compatible entrypoint and loads Sharp dynamically.

The accepted integrated build produces a 13.23 kB uncompressed and 3.71 kB gzip browser entry,
guarded by a 10 KiB gzip package-smoke budget.
Registry evidence for Sharp 0.35.3 showed approximately 8.5–9 MB compressed and 19–20 MB unpacked
for one common native platform. That install cost is accepted for the single package. A companion
package is reconsidered only if supported deployments expose concrete native-install or package-
footprint problems.

## Determinism Boundary

Exact fingerprint determinism begins at the returned normalized RGBA bytes. Node and browser
decoders are separately configured and tolerance-tested; the same encoded file is not promised to
produce byte-identical pixels across runtimes or browser engines.

Changing the decoder backend or normalization configuration requires adapter-contract review and
new tolerance evidence. It does not change `pdq-v1` unless normalized-pixel-to-fingerprint behavior
also changes.

## Compatibility

- The root `imageHash()` API, callback timing, inputs, decoder behavior, errors, and serialized
  BlockHash output are unchanged.
- `/core` contains no path, URL, Node.js, Sharp, `Blob`, `File`, or `ImageData` type dependency.
- Browser and Node adapters implement the same generic core interface and run the same behavioral
  contract assertions with runtime-specific fixtures.

## Approval

- Decision owner: image-fingerprint maintainer
- Accepted revision/date: 2026-08-09
- Release dependency: packed real-browser and worker verification from Task 11
