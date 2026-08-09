# PDQ Conformance Fixture Provenance

The companion `raw-vectors.json` file is generated entirely from deterministic, programmatic pixel
patterns defined in `scripts/generate-pdq-fixtures.mjs`. It contains no third-party image and no
bytes copied from Meta's test corpus.

The companion `stage-vectors.json` file is likewise generated from deterministic pixels defined in
`scripts/generate-pdq-stage-fixtures.mjs`. It freezes exact float32 bit patterns for selected luma
and 64 by 64 downsample stages plus their quality answers. The source bytes and SHA-256 checksum for
each diagnostic vector are stored alongside those answers.

Expected 256-bit hashes and quality scores were produced by the local decoder-free oracle described
in `tools/pdq-oracle/README.md`, using Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`. The oracle input for every vector is stored with a
SHA-256 checksum. RGBA cases also retain the original source bytes and checksum; their oracle input
is RGB produced by the approved formula:

```text
floor((channel * alpha + 255 * (255 - alpha) + 127) / 255)
```

The JSON omits timestamps, host paths, compiler versions, and other machine-specific values so
regeneration is byte-for-byte deterministic. Build logs provide compiler provenance separately.
The corpus was reproduced exactly with Apple clang 21.0.0 on macOS arm64 and Debian Clang 19.1.7
on Linux arm64. GCC is not an approved fixture-generation toolchain because GCC 14.2.0 produced
different threshold bits for several vectors from the same checked input bytes.

To regenerate after building the pinned oracle with Clang:

```sh
PDQ_ORACLE_CXX=clang++ pnpm pdq:oracle:build -- --output /outside/repository/pdq-oracle
pnpm pdq:fixtures:generate -- --oracle /outside/repository/pdq-oracle/pdq-oracle
pnpm pdq:stages:generate -- --oracle /outside/repository/pdq-oracle/pdq-oracle
```

Changing the pinned commit, patterns, normalization rule, schema, intermediate float bits, hash, or
quality requires explicit contract review rather than routine fixture refresh.
