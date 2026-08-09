# PDQ Performance Task Plan

Goal: Complete modernization Task 16 with reproducible TypeScript-versus-same-source-WASM and
adapter performance evidence, without changing the production backend.

## Frozen Pre-Measurement Budgets

| Workload | TypeScript core p95 | Adapter total p95 |
| --- | ---: | ---: |
| ~0.25 MP region | 20 ms | 100 ms |
| ~2 MP scan | 100 ms | 400 ms |
| ~12 MP high-resolution image | 500 ms | 2,000 ms |

- Browser main-thread 0.25 MP maximum measured sample: 50 ms.
- Browser 2 MP and 12 MP run in a worker; p95 main-thread heartbeat delay: 50 ms.
- Node 12 MP incremental peak RSS: 384 MiB core-only and 512 MiB adapter-total.
- Optional WASM asset: at most 300 KiB raw and 150 KiB gzip; warm initialization p95 at most 50 ms.
- WASM advances only if it remains exactly conformant and either TypeScript misses a core budget or
  WASM is at least 2x faster by p95 at both 2 MP and 12 MP. It is never selected silently.

## Phases

- [x] Audit the current TypeScript core, adapters, WASM oracle, and browser harness boundaries.
- [x] Define and red-test the versioned benchmark plan, workload generation, statistics, and gates.
- [x] Implement Node TypeScript core and adapter timing with process-level memory evidence.
- [x] Build a pinned in-process same-source WASM comparator that accepts identical RGB bytes.
- [x] Implement Chromium, Firefox, and WebKit core/adapter/worker-responsiveness collection.
- [x] Retain raw results and publish p50/p95, throughput, memory, sizes, limitations, and decision.
- [x] Run Node 22/24, package, browser, reproducibility, and five-axis review gates.

## Acceptance Criteria

- Identical deterministic inputs of approximately 0.25, 2, and 12 megapixels are measured.
- Warmups and 30 retained samples per workload are recorded; percentiles use nearest rank.
- TypeScript and WASM consume the exact same normalized RGB bytes and produce identical hash and
  quality before timing is accepted.
- Decode, TypeScript core, WASM core, total adapter, WASM initialization, memory, and asset size are
  reported separately where the runtime exposes reliable measurements.
- Browser responsiveness is measured from the main thread while larger work runs in a worker.
- The report names hardware, OS, Node, Sharp/libvips, browser engines, and WASM toolchain.
- No benchmark asset or backend enters the published npm package.

## Decisions

- Use deterministic synthetic RGB patterns; performance does not require third-party imagery.
- Benchmark production TypeScript entrypoints, not internal stage functions.
- Compile a minimal Emscripten module from the same pinned Meta C++ translation units and expose a
  raw RGB function usable in Node and browsers without encoded-image I/O.
- Keep timing orchestration opt-in and outside ordinary CI; offline plan/report contract tests stay
  in Vitest.
- Treat browser memory APIs as optional evidence because availability differs by engine; Node peak
  RSS and WASM linear-memory growth are the stable memory measures.

## Risks

- Timer noise and thermal state can distort small samples; use warmups, named host data, and a
  repeated representative run.
- Old pinned Emscripten glue may not load cleanly in modern Node and all browsers; prefer a minimal
  direct WebAssembly interface and keep the existing oracle untouched.
- Measuring total adapter latency from synthetic encodes can accidentally include generation;
  encode once before retained samples.
- Synchronous core work can block browser heartbeats; large browser workloads must be worker-based.
