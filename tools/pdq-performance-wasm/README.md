# Disposable PDQ performance WASM

This development-only wrapper exposes raw RGB8 hashing from the same pinned Meta ThreatExchange
sources used by the conformance oracle. It exists only to compare the production TypeScript core
with an in-process WASM goalpost. It is not a runtime backend and no generated WASM or upstream
source enters the npm package.

Build into an empty directory outside this repository:

```sh
./scripts/build-pdq-performance-wasm.sh \
  --output /outside-repository/pdq-performance-wasm \
  --source /absolute/path/to/ThreatExchange
```

The source checkout must be clean and exactly at commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`. The build pins the Emscripten container digest and
uses `-O3 -ffp-contract=off`, standalone WASM, and memory growth. The exported boundary validates
dimensions and a 64 MiB RGB input limit before allocating the two full-size luma work buffers.

Meta's retained source notice is recorded in
[`../pdq-oracle/THIRD_PARTY_LICENSES.md`](../pdq-oracle/THIRD_PARTY_LICENSES.md). Redistribution of a
locally linked artifact must retain the applicable third-party notice.
