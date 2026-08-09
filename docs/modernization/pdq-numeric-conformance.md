# PDQ Numeric Conformance Profile

Status: accepted for `pdq-v1` core implementation  
Updated: 2026-08-09

## Decision

`pdq-v1` uses a portable, unfused float32 profile derived from Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.

The algorithm identifier covers this complete normalized-pixel-to-hash behavior. Changing a
coefficient bit, arithmetic boundary, operation order, median rule, or serialization rule requires
a new algorithm version; it is not a compatible implementation detail.

## Frozen Arithmetic Contract

- Gray bytes convert exactly to float32 values.
- RGB coefficients are the float32 encodings of `0.299`, `0.587`, and `0.114`.
- Each RGB multiplication rounds to float32 before each left-associated addition rounds to
  float32: `(R * 0.299 + G * 0.587) + B * 0.114`.
- Every Jarosz-filter addition, subtraction, and division rounds independently to float32.
- The 1,024 DCT coefficient uint32 bit patterns are frozen in
  `src/core/algorithms/pdq/dct-matrix.ts`. They are generated from the pinned oracle's first DCT
  pass over a self-checking 64 by 64 identity-basis input.
- Each DCT multiplication rounds to float32, then its addition into the accumulator rounds
  separately to float32. Terms are accumulated from index 0 through 63 in both passes.
- Torben median selection, strict-greater-than thresholding, Meta word order, and lowercase
  64-character hexadecimal serialization remain unchanged.
- Quality uses the reference integer gradient calculation and is independent of the DCT profile.

In TypeScript, float32 operation boundaries use `Math.fround` and storage boundaries use
`Float32Array`. Runtime cosine or other transcendental functions are not part of production
hashing.

## Why Unfused

The normally optimized native C++ source permits a compiler to contract multiplication and addition
into float32 FMA operations. That produced architecture-sensitive hashes: arm64 Clang and x64 Clang
did not regenerate the same corpus.

The same pinned source compiled by Emscripten uses separate WebAssembly `f32.mul` and `f32.add`
semantics. Apple Clang 21 on arm64 with only `-ffp-contract=off` produced byte-identical raw and
stage corpora to that WASM build. This profile therefore has three useful properties:

1. it remains faithful to the pinned source's written operation order;
2. it is reproducible by native C++, WebAssembly, and pure TypeScript without software FMA; and
3. it leaves a future optional WASM backend possible without changing persisted hashes.

The WASM build is a development comparator, not a package dependency or runtime backend.

## Evidence

| Evidence | Result |
| --- | --- |
| Frozen DCT identity-basis coefficients | 1,024/1,024 exact uint32 bits |
| TypeScript versus Emscripten 3.1.7 raw corpus | 16/16 exact hash and quality results |
| TypeScript versus Emscripten 3.1.7 stage corpus | 4/4 vectors exact at every selected stage |
| Apple Clang 21 arm64 `-ffp-contract=off` versus WASM raw corpus | byte-identical |
| Apple Clang 21 arm64 `-ffp-contract=off` versus WASM stage corpus | byte-identical |
| Apple Clang 21 x86_64 `-ffp-contract=off` versus accepted corpora | raw and stage byte-identical |
| Seeded TypeScript versus Apple Clang 21 arm64 `-ffp-contract=off` differential | 10,000/10,000 exact hash and quality results |

Frozen artifact SHA-256 values:

- `raw-vectors.json`: `14aaeec3f68da5ca98a1e76915af746e164e6771ae9f566b68bcf537bd78552f`
- `stage-vectors.json`: `0ad88a5ef3c38e7b75919634989d286136a1ea93b6f7403cffcb0af3c618a9d5`
- `dct-matrix.ts`: `2af39f6a4c34093aa89faff3f56a49c0b4c01d9d39190f4002ce56e66c09600a`

The regular Node 22 and Node 24 CI jobs prove the pure TypeScript implementation on x64 Linux. The
separate Linux arm64 job rebuilds the pinned native oracle with contraction disabled and requires
byte-identical raw and stage corpora. Real Chromium, Firefox, WebKit, and worker execution remains a
separate browser-conformance gate before release.

### Large seeded differential

The accepted large profile uses generator version 1, seed `0x5eedc0de`, and 10,000 valid packed raw
inputs: 3,334 `gray8`, 3,333 `rgb8`, and 3,333 `rgba8`. Dimensions include the 5-pixel minimum,
64-by-64 fast path, odd dimensions, and 5-by-128/128-by-5 extreme aspect ratios. All other
dimensions and all source bytes come from the versioned deterministic generator. RGBA inputs are
passed unchanged to TypeScript and normalized with the frozen white-composite rule before entering
the RGB-only C++ oracle.

Both accepted runs returned 10,000 exact hash-and-quality matches and zero mismatches. Their stable
input identities were identical:

- source SHA-256: `3e38c867c8f245147dc69b19f918954e1eb2271b22bfbad4130cbcac6a480def`
- framed oracle-input SHA-256: `2c1d2c56498dbbb9ccea121c5cafee99c880f26b8f9e99b79b3b35de862d36f7`

The observed local comparison times were 4,089.338 ms and 4,122.152 ms. Timing is informational;
profile version, seed, count, format counts, both input checksums, pinned oracle metadata, exact
match count, and mismatch count are the reproducibility contract.

The development-only oracle batch protocol starts with ASCII `PDQB001`, a little-endian uint32
request count, then length-delimited requests containing a one-byte format (`1` gray or `2` RGB),
little-endian uint32 width, height, byte length, and packed bytes. It preserves the 64 MiB limit per
image and rejects invalid magic, counts, formats, dimensions, lengths, truncation, and trailing
bytes. It exists only to avoid 10,000 process launches and is not part of the npm API or artifact.

If any future run differs, do not adjust floating-point code first. Copy the reported source format,
dimensions, and base64 bytes into `__tests__/fixtures/pdq/regressions.json`, add the exact C++ hash
and quality, reproduce the failure in the ordinary offline conformance suite, and only then review
numeric code. The accepted run had no mismatch, so it adds no synthetic regression vector.

## Regeneration

Build fixtures only with the repository oracle script, which pins `-ffp-contract=off`:

```sh
PDQ_ORACLE_CXX=clang++ pnpm pdq:oracle:build -- --output /outside-repository/pdq-oracle
pnpm pdq:fixtures:generate -- --oracle /outside-repository/pdq-oracle/pdq-oracle
pnpm pdq:stages:generate -- --oracle /outside-repository/pdq-oracle/pdq-oracle
pnpm pdq:dct-matrix:generate
```

Run the large differential after building a fresh pinned oracle:

```sh
pnpm pdq:differential \
  --oracle /outside-repository/pdq-oracle/pdq-oracle \
  --count 10000 \
  --seed 0x5eedc0de
```

The package command builds the normal distributable core before running the comparator. Use
`--plan-only` to reproduce generator checksums without a native binary. The command verifies the
oracle's protocol, repository, and commit metadata before hashing and exits nonzero if any hash or
quality result differs.

Build and compare the disposable same-source WASM oracle with:

```sh
pnpm pdq:wasm:build -- \
  --output /outside-repository/pdq-wasm-oracle \
  --source /absolute/path/to/ThreatExchange
pnpm pdq:wasm:compare -- \
  --node /path/to/node-16 \
  --oracle-js /outside-repository/pdq-wasm-oracle/pdq-oracle.js
```

Any expected-answer refresh requires contract review and the native/WASM differential; changing
fixtures merely to accept a new compiler result is prohibited.
