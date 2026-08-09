# Pinned PDQ C++ Oracle

This local-only tool compiles a decoder-free raw-pixel wrapper around Meta's normative PDQ C++
implementation. It exists to generate test answers for the TypeScript port; it is not a production
dependency and is excluded from the npm package.

## Frozen Reference

- Repository: <https://github.com/facebook/ThreatExchange>
- Commit: [`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`](https://github.com/facebook/ThreatExchange/tree/baefb4ed67b6cdc1d4c82dbaef858d50866ac424)
- Raw API: [`pdqhashing.h`](https://github.com/facebook/ThreatExchange/blob/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/pdq/cpp/hashing/pdqhashing.h)
- Canonical formatting: [`pdqhashtypes.cpp`](https://github.com/facebook/ThreatExchange/blob/baefb4ed67b6cdc1d4c82dbaef858d50866ac424/pdq/cpp/common/pdqhashtypes.cpp)
- License: [BSD notice](./THIRD_PARTY_LICENSES.md)

The build includes only these upstream translation units:

- `pdq/cpp/hashing/pdqhashing.cpp`
- `pdq/cpp/downscaling/downscaling.cpp`
- `pdq/cpp/hashing/torben.cpp`
- `pdq/cpp/common/pdqhashtypes.cpp`
- `pdq/cpp/common/pdqhamming.cpp`

No decoder, CImg, encoded image, index, command-line tool, or WASM source is compiled.

## Build And Verify

Create a disposable directory outside this repository:

```sh
oracle_dir=$(mktemp -d)
./scripts/build-pdq-oracle.sh --output "$oracle_dir"
pnpm pdq:oracle:smoke -- --oracle "$oracle_dir/pdq-oracle"
pnpm pdq:fixtures:generate -- --oracle "$oracle_dir/pdq-oracle"
pnpm pdq:stages:generate -- --oracle "$oracle_dir/pdq-oracle"
```

The build script fetches only the pinned commit, verifies the checkout, refuses any upstream
modifications, and prints the compiler version and flags. For an already verified offline checkout:

```sh
./scripts/build-pdq-oracle.sh \
  --output "$oracle_dir" \
  --source /absolute/path/to/ThreatExchange
```

Set `PDQ_ORACLE_CXX` to choose a different compiler. The baseline flags are
`-std=c++11 -O3 -Wall -Wextra -Werror` with the verified checkout root as the include path.

Fixture regeneration uses Clang as part of the oracle toolchain contract. The saved corpus was
byte-identical under Apple clang 21.0.0 on macOS arm64 and Debian Clang 19.1.7 on Linux arm64. A
Debian GCC 14.2.0 build produced different threshold bits for several synthetic vectors even with
floating-point contraction disabled and optimization removed. Do not refresh golden answers with
GCC. CI pins Ubuntu 24.04 and its installed `clang++-18`, then requires a byte-identical corpus.

## Oracle Protocol

```text
pdq-oracle <gray8|rgb8> <width> <height>
pdq-oracle --diagnostics <gray8|rgb8> <width> <height>
pdq-oracle --metadata
```

The hashing form reads exactly `width × height × channels` tightly packed bytes from stdin.
Dimensions must each be at least 5, and the declared input may not exceed 64 MiB. On success it
writes one JSON line:

```json
{"hash":"64 lowercase hexadecimal characters","quality":0}
```

Errors are written to stderr and return status 2. RGBA is intentionally absent from this wrapper;
the project fixture generator applies the approved deterministic white-compositing rule and records
both the source RGBA checksum and normalized RGB oracle-input checksum.

The diagnostics form accepts the same input and emits the initial luminance and 64 by 64
downsample buffers as arrays of unsigned float32 bit patterns, plus quality. It exists only to
generate exact intermediate-stage fixtures for the pure TypeScript port.

`--metadata` returns protocol version 1, the official repository URL, and the pinned commit. The
fixture generator refuses to produce answers unless this identity exactly matches its own frozen
contract.

## Licensing Boundary

`main.cpp` and the project scripts are original repository tooling. A locally built binary links
the pinned BSD-licensed Meta source and must retain the third-party notice if redistributed. The
binary, checkout, build directory, Meta source, and upstream test images must never be committed or
included in the npm package.
