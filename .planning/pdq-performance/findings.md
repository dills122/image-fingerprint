# PDQ Performance Findings

## Sources

- `docs/modernization/implementation-plan.md` Task 16 requires core and adapter latency, memory,
  browser responsiveness, artifact size, retained raw results, and an explicit WASM decision.
- `scripts/build-pdq-wasm-oracle.sh` pins Meta commit
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` and Emscripten image digest
  `6143f5b3d58fe6e7faf9f279d27ea9ea975983ee2b5490478abda126a6762f34`.
- The current WASM oracle is a Node command-line launcher intended for conformance and process
  spawning; it is not a fair in-process Node/browser performance comparator.

## Notes

- Branch starts from merged `main` commit `5b47fb7` after documentation PR #12.
- Named evidence host: Apple M1 Max, 10 cores, 64 GB memory, macOS arm64.
- Docker 29.6.1 and Node 16, 18, 22, and 24 runtimes are available locally.
- The pinned ThreatExchange checkout remains available outside the repository for local WASM builds.

## Resolved Questions

- Pinned Emscripten 3.1.7 emits a 24,094-byte standalone module that loads directly in Node,
  Chromium, Firefox, and WebKit without generated Node-only glue.
- Node process-isolated peak RSS and WASM linear-memory size are stable measures. Browser memory
  APIs are recorded only as capabilities and are not compared across engines.
- TypeScript met every absolute latency, adapter, memory, and responsiveness budget. WASM remained
  exact but did not meet the predeclared advancement rule, so the production backend stays
  TypeScript-only.
