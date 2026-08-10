# image-fingerprint 0.1.0 Release Notes

Status: stable release preparation
Updated: 2026-08-09

The first registry version, `0.1.0-rc.0`, was published manually under the `next` tag solely to
create the npm package. GitHub Actions then published `0.1.0-rc.1` through the configured npm trusted
publisher with SLSA provenance. The stable target remains `0.1.0`.

## Summary

`image-fingerprint` 0.1.0 introduces versioned BlockHash and PDQ records, a deterministic
runtime-neutral pixel core, Node and browser image-preparation adapters, fingerprint codecs,
mathematical comparison, explicit PDQ policy helpers, caller-owned crop extraction, and exact
`image-hash@7` migration support.

PDQ is opt-in. `image-fingerprint` does not expose the old callback or remote-request API.

The [project site](https://dills122.github.io/image-fingerprint/) includes an interactive browser
playground for exploring fingerprint behavior. It is documentation and demonstration tooling, not
part of the npm package payload.

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

Both release-candidate tarballs contain 108 files and are 84.8 kB compressed and 357.0 kB unpacked.
The manual `0.1.0-rc.0` publish has npm shasum
`eb96731b0433427fd9ecaec4b29263ed2b8a9583`. The trusted-publisher `0.1.0-rc.1` publish has npm
shasum `d3fc28ac0a2b08561797a0b4fca44ea34a6484d5`, registry SLSA provenance, and Git commit
`e7a124a26a5715c17d2cefdbd5c219af8e229371`. Packed CommonJS and ESM runtimes, TypeScript
Node16/NodeNext/Bundler resolution, and browser main-thread/module-worker consumers all passed.

The prepared stable `0.1.0` npm dry-run contains 108 files, is 85.0 kB compressed and 358.0 kB
unpacked, and has shasum `09add482027b69a064ff1692c1fa9826d86622f3`. npm selected the public
`latest` tag. This stable package has not been published.

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

## Release Checklist

- [x] Merge `0.1.0-rc.0` after all required CI and CodeQL checks pass.
- [x] Publish `0.1.0-rc.0` manually under `next` using the
  [trusted-publishing bootstrap](./trusted-publishing-bootstrap.md).
- [x] Configure npm trusted publishing for `dills122/image-fingerprint` and `release.yml`.
- [x] Publish `0.1.0-rc.1` under `next` through GitHub Actions and verify npm provenance.
- [x] Set npm publishing access to require 2FA and disallow tokens after OIDC succeeds.
- [ ] Merge the `0.1.0` version bump after the complete required-check matrix passes.
- [ ] Confirm the signed `v0.1.0` tag points at the current `main` commit.
- [ ] Confirm the stable workflow publishes `latest` and creates the GitHub release.

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
