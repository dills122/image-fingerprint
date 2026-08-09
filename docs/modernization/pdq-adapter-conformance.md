# PDQ encoded-image adapter conformance

Status: Task 15 evidence captured on 2026-08-09

## Conclusion

The encoded-image adapters are deterministic on the measured corpus, and the portable TypeScript
PDQ core remains exactly conformant with the pinned C++ reference after Node normalization. The
initial browser gate of Hamming distance at most 10 holds for every measured case except Firefox's
Display P3 PNG decode, which measured 12 bits and is categorized as an ICC/color-management
exception.

This does **not** create an exact-equality promise for separately decoded encoded images. Exact
hash equality begins only after callers supply identical normalized pixels. Encoded-image hashes
remain decoder-, color-management-, browser-, version-, and platform-sensitive matching signals.

## Reference boundary

Meta ThreatExchange commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` is the normative PDQ
hash implementation, but the repository's pinned oracle deliberately accepts only raw `gray8` or
`rgb8` pixels. Upstream CImg I/O is replaceable system integration rather than a pinned encoded
decoder contract.

The Task 15 reference pipeline is therefore:

1. Decode the committed encoded bytes with `sharp@0.35.3`.
2. Apply `autoOrient()`, `toColourspace('srgb')`, `ensureAlpha()`, and `raw()`.
3. Composite the resulting straight-alpha RGBA8 pixels over white with the library's frozen integer
   rounding rule.
4. Pass those RGB8 bytes to the pinned C++ oracle.
5. Require the TypeScript core to equal the C++ hash and quality exactly on those same pixels.

Browser adapters decode the same bytes through `createImageBitmap` and an sRGB canvas. Their PDQ
outputs are compared to the reference result by Hamming distance. A result is gate-eligible when
both reference and candidate quality are at least 80; the initial maximum distance is 10.

## Corpus and method

The versioned corpus contains eight committed synthetic images. The source patterns contain no
third-party artwork and are released under CC0-1.0. The manifest records each encoded file's SHA-256,
byte length, expected post-orientation dimensions, format, behavior categories, generator checksum,
Sharp version, libvips version, and provenance.

Coverage includes:

- PNG, JPEG, and WebP;
- lossless and lossy encoding;
- opaque, grayscale, and straight-alpha content;
- sRGB and Display P3 ICC profiles; and
- EXIF orientation 6.

Each Node and browser decode is repeated twice. The suite requires identical dimensions, normalized
pixel checksum, fingerprint, and quality within the same decoder/configuration. Node TypeScript and
C++ results are compared on every repetition. Browser measurements run in Chromium, Firefox, and
WebKit and retain engine versions in the raw report.

Percentiles use the nearest-rank method. The small synthetic corpus is intended to validate the
mechanism and expose category-specific decoder variance; it is not a statistical proxy for all
real-world images, camera profiles, malformed inputs, operating systems, or future decoder versions.

## Captured result

Host: macOS arm64, Node 24.19.0, Sharp 0.35.3, libvips 8.18.3. Browser engines: Chromium
151.0.7922.34, Firefox 153.0, and WebKit 26.5. All 32 runtime/fixture observations had quality 100.

| Runtime / engine | Eligible | p50 | p95 | Maximum | Exceptions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node / Sharp | 8 | 0 | 0 | 0 | 0 |
| Browser / Chromium | 8 | 0 | 0 | 0 | 0 |
| Browser / Firefox | 8 | 0 | 12 | 12 | 1 |
| Browser / WebKit | 8 | 0 | 2 | 2 | 0 |

Notable category results:

| Category | Chromium max | Firefox max | WebKit max | Interpretation |
| --- | ---: | ---: | ---: | --- |
| sRGB | 0 | 0 | 2 | Within the initial gate |
| alpha | 0 | 0 | 0 | Pixel bytes vary by engine, but measured PDQ hashes do not |
| EXIF orientation | 0 | 0 | 0 | Dimensions and fingerprint agree after orientation |
| Display P3 | 0 | 12 | 0 | Firefox ICC/color conversion exception |
| JPEG | 0 | 0 | 2 | WebKit decoder variance, within the gate |

### Investigated exception

`opaque-p3-png` in Firefox produced Hamming distance 12 at quality 100. The encoded bytes,
dimensions, and repeated Firefox output were stable. The same engine matched Sharp exactly for the
sRGB PNG generated from the same source pattern, while the other browser engines stayed at distance
0 for the P3 fingerprint. The normalized pixel checksums also differ by engine for the P3 image.
Together these observations isolate the exception to ICC/color-management behavior at the encoded
decode boundary rather than PDQ numeric drift, nondeterminism, orientation, alpha, or PNG decoding
in general.

The global distance gate remains 10. The corpus manifest narrowly accepts only this Firefox/fixture
combination through distance 12, so a larger drift or any new exception still fails the suite.
Consumers needing cross-decoder matching for wide-gamut input
should normalize encoded images through one controlled decoder pipeline before hashing, convert
assets to sRGB at ingestion, or calibrate an application-specific policy with their own corpus. The
library does not silently raise its default matching policy to accommodate this single platform
case.

## Reproduction

Build the pinned oracle outside the repository, then run:

```sh
pnpm pdq:adapter:differential -- \
  --oracle /outside-repository/pdq-oracle/pdq-oracle \
  --output benchmarks/pdq/results/<host-profile>.json
```

The opt-in runner builds the package, validates manifest paths and checksums, runs all three browser
engines, emits the full raw report, and exits nonzero for unaccepted gate exceptions. It separately
reports whether the initial gate passed and whether only bounded documented exceptions remain. Plan and corpus
validation do not require the oracle or browser launch:

```sh
node benchmarks/pdq/adapter-differential.mjs --plan-only
```

The [captured raw report](../../benchmarks/pdq/results/darwin-arm64-node24.json) preserves every
runtime/fixture observation, categorized summary, decoder version, and gate outcome.
