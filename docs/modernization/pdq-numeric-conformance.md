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

Frozen artifact SHA-256 values:

- `raw-vectors.json`: `14aaeec3f68da5ca98a1e76915af746e164e6771ae9f566b68bcf537bd78552f`
- `stage-vectors.json`: `0ad88a5ef3c38e7b75919634989d286136a1ea93b6f7403cffcb0af3c618a9d5`
- `dct-matrix.ts`: `2af39f6a4c34093aa89faff3f56a49c0b4c01d9d39190f4002ce56e66c09600a`

The regular Node 22 and Node 24 CI jobs prove the pure TypeScript implementation on x64 Linux. The
separate Linux arm64 job rebuilds the pinned native oracle with contraction disabled and requires
byte-identical raw and stage corpora. Real Chromium, Firefox, WebKit, and worker execution remains a
separate browser-conformance gate before release.

## Regeneration

Build fixtures only with the repository oracle script, which pins `-ffp-contract=off`:

```sh
PDQ_ORACLE_CXX=clang++ pnpm pdq:oracle:build -- --output /outside-repository/pdq-oracle
pnpm pdq:fixtures:generate -- --oracle /outside-repository/pdq-oracle/pdq-oracle
pnpm pdq:stages:generate -- --oracle /outside-repository/pdq-oracle/pdq-oracle
pnpm pdq:dct-matrix:generate
```

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
