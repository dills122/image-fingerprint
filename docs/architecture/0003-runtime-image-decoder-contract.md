# ADR 0003: Runtime Image Decoder Contract

Status: accepted
Updated: 2026-08-09

## Context

The portable fingerprint core accepts normalized pixels, while applications commonly begin with a
path, encoded bytes, `Blob`, `File`, or `ImageData`. The MTG scanning consumer must decode once and
fingerprint both the oriented full image and caller-selected regions without coupling PDQ to a
decoder.

Node.js and browsers cannot share a decoder implementation, but they can share input limits, output
pixels, cancellation, errors, and Promise-based orchestration. Historical format-specific decoding
is retained only as a named BlockHash policy in the new Node flow.

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
- `fingerprintImage()` accepts PDQ or BlockHash. With normalized decoding it must equal
  `fingerprintPixels(await decodeImage(source), fingerprintOptions)`.
- Node BlockHash additionally accepts `decoderMode: 'image-hash-v7'`. This named compatibility
  policy uses the historical format-specific decoders without orientation or ICC normalization.
  It is unavailable for PDQ and in browser entrypoints.
- Remote URL fetching is not included. Applications own network and request policy and pass encoded
  bytes to the adapter.

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

The `image-hash-v7` codecs are also synchronous. Compatibility-mode cancellation is checked before
the read/decode boundary and immediately after decoding, but cannot interrupt a decoder already on
the JavaScript stack.

## Package And Size Boundary

The package declares `sideEffects: false`. `/core` and `/browser` have separate ESM graphs that must
contain no Sharp, Node.js built-ins, or legacy decoder dependencies. `/node` is a separate CommonJS-
compatible entrypoint, loads Sharp dynamically, and contains the historical decoder dependencies
needed by `image-hash-v7`. Deterministic compatibility pins `jpeg-js@0.4.4`, `pngjs@7.0.0`, and
`@cwasm/webp@0.1.5`.

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

Historical BlockHash is the deliberate exception at the encoded-image boundary: the Node-only
`image-hash-v7` policy freezes the old decoder family and preprocessing behavior so existing stored
hashes can be reproduced. Decoder mode must be retained as application metadata when encoded bytes
must regenerate the same fingerprint.

Applications must not require fingerprint string equality across independently decoded runtimes.
They should either normalize and hash through one controlled, versioned decoder pipeline or use a
Hamming-distance policy calibrated on representative inputs. The measured cross-decoder evidence,
including the bounded Firefox Display P3 exception, is published in the
[PDQ adapter conformance report](../modernization/pdq-adapter-conformance.md).

Changing the decoder backend or normalization configuration requires adapter-contract review and
new tolerance evidence. It does not change `pdq-v1` unless normalized-pixel-to-fingerprint behavior
also changes.

## Compatibility

- The old callback, remote-request, MIME-extension, and internal deep-import surfaces are not part
  of `image-fingerprint`. Historical serialized BlockHash output remains available through the
  explicit Node policy.
- `/core` contains no path, URL, Node.js, Sharp, `Blob`, `File`, or `ImageData` type dependency.
- Browser and Node adapters implement the same generic core interface and run the same behavioral
  contract assertions with runtime-specific fixtures.

## Approval

- Decision owner: image-fingerprint maintainer
- Accepted revision/date: 2026-08-09
- Release dependency: packed real-browser and worker verification from Task 11
