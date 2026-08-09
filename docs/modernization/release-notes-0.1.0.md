# image-fingerprint 0.1.0 Release Notes

Status: release-candidate documentation
Updated: 2026-08-09

## Summary

`image-fingerprint` 0.1.0 introduces versioned BlockHash and PDQ records, a deterministic
runtime-neutral pixel core, Node and browser image-preparation adapters, fingerprint codecs,
mathematical comparison, explicit PDQ policy helpers, caller-owned crop extraction, and exact
`image-hash@7` migration support.

PDQ is opt-in. `image-fingerprint` does not expose the old callback or remote-request API.

## Runtime and Decoder Support

- Node.js 22.14 or newer; CI verifies Node 22 and 24.
- Modern Chromium, Firefox, and WebKit through the browser ESM entrypoint and module workers.
- Static JPEG, PNG, and WebP encoded images. Animated inputs are rejected.
- Node normalized policy: `sharp@0.35.3`, EXIF auto-orientation, sRGB conversion, straight-alpha
  RGBA8 output.
- Browser normalized policy: native `createImageBitmap` plus an sRGB canvas.
- Node historical policy: `decoderMode: 'image-hash-v7'` for BlockHash only, using the historical
  JPEG/PNG/WebP decoder behavior without orientation or ICC normalization. The compatibility stack
  pins `jpeg-js@0.4.4`, `pngjs@7.0.0`, and `@cwasm/webp@0.1.5`.
- New adapters accept local paths, file URLs, bytes, `Blob`, `File`, or `ImageData` as appropriate
  to their runtime. Applications own remote fetching and request policy.

The captured browser evidence used Chromium 151.0.7922.34, Firefox 153.0, and WebKit 26.5. These are
measured engine versions, not permanent upper bounds.

## Persistence and Migration

Store the complete schema-versioned fingerprint record for new values. It carries the algorithm,
encoding, bit length, BlockHash parameters, and PDQ quality where applicable. Parse untrusted stored
records with `parseFingerprint()`.

Decoder and preprocessing provenance is deliberately not part of schema version 1. Applications
that need to recreate a fingerprint from encoded bytes must also store a pipeline identifier, such
as `normalized-sharp-0.35.3` or `image-hash-v7`. Do not mix normalized and historical BlockHash
strings in an equality index without recording which policy produced each value.

For an existing `image-hash@7` store:

1. Use Node `fingerprintImage()` with `decoderMode: 'image-hash-v7'` and the same
   `bitsPerSide`/method.
2. Verify a representative sample against stored values before switching reads.
3. Persist the versioned record and decoder policy for new writes.
4. If adopting normalized decoding or PDQ, dual-write during calibration; do not overwrite the old
   index until product-specific matching and rollback have been exercised.

Rollback is to continue reading the historical bare-hash index and use the named compatibility
mode. No stored-hash rewrite is required by this release.

## Quality, Comparison, and Policy

PDQ quality is an integer from 0 through 100 describing information content. It is not a similarity
score. `compareFingerprints()` returns Hamming distance and explicit incompatibility; it never
chooses a match policy.

`PDQ_STARTING_POLICY` is the explicit `{ maxDistance: 31, minQuality: 50 }` ecosystem starting
point. `evaluatePdqMatch()` requires the caller to supply a policy. Thresholds must be calibrated on
representative product images and preprocessing.

The MTG camera calibration found that full unrectified frames were not usable as a standalone PDQ
input and that simple card regions still had substantial positive/negative overlap. PDQ should be a
candidate or ranking signal after consistent normalization, not the sole exact-printing decision.

## Known Limits

- Independently decoded encoded files can differ across Node and browser engines. Exact equality is
  promised only for identical normalized pixel bytes or a controlled historical decoder policy.
- Deep or misaligned crops, perspective changes, mirrors, and rotations can produce large PDQ
  distances. Crop detection, rectification, and application policy remain caller-owned.
- Wide-gamut/ICC behavior varies. The measured Firefox Display-P3 case was 12 bits from the Sharp
  reference while other measured engines were at zero.
- Perceptual hashes are not cryptographic hashes, proof of identity, or adversarial-security
  controls.

## Compatibility Evidence

- Existing committed golden hashes remain unchanged through the Promise compatibility mode.
- Normalized Sharp versus historical decoding matched 54 of 60 committed fixture/configuration
  comparisons; differences were caused by EXIF orientation and Display-P3 normalization.
- A Sharp configuration intended to imitate historical behavior still differed on 98 of 720
  generated comparisons, all JPEG.
- The shipped `image-hash-v7` mode matched all 720 generated JPEG/PNG/WebP comparisons across
  methods 1 and 2 and 4, 8, and 16 bits per side against the actual published
  `image-hash@7.0.1` tarball (npm shasum `6d5a77d1cb7aa24c93d7d7729d6787d0023c85e9`).
- Raw-pixel PDQ matches the pinned Meta C++ reference exactly. Captured Node, browser, performance,
  and MTG matching evidence is linked from `docs/modernization/README.md`.

The final `image-fingerprint@0.1.0` dry-run tarball contains 108 files, is 84.6 kB compressed and
356.4 kB unpacked, and has npm dry-run shasum `fa1bdb897e564f24bfecf94b5554d1b351be26cc`.
Packed CommonJS and ESM runtimes, TypeScript Node16/NodeNext/Bundler resolution, and browser
main-thread/module-worker consumers all passed.

## Verification Commands

```sh
pnpm check
npm pack --dry-run
pnpm pack:check
pnpm test:browser
pnpm compat:image-hash-v7
pnpm pdq:differential
pnpm pdq:adapter:differential -- --oracle /absolute/path/to/pdq-oracle
pnpm pdq:matching -- --manifest /absolute/path/to/manifest.json
```

Oracle, benchmark, and dataset commands are reproducibility tools with external prerequisites; they
are not required for an ordinary package install.

The offline differential command compares the generated candidate digest with the frozen SHA-256
of all 720 results captured from the published `image-hash@7.0.1` tarball.

## Attribution and Provenance

- PDQ behavior is validated against Meta ThreatExchange commit
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` under its published BSD terms.
- BlockHash derives from Commons Machinery's `blockhash-js`; `image-hash` history and contributors
  remain credited in the package metadata and README.
- The committed adapter corpus is synthetic CC0-1.0 material with checksums and generation metadata.
- The MTG calibration references the external Sol Ring Dataset at pinned commit
  `11f4c7ba2201dfc67df88093ed49ca8013f23b14`; those images are not committed or published in the
  npm package.
- The production package ships no Meta C++ binary, WASM comparator, external MTG image, or model.
