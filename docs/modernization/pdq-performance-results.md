# PDQ TypeScript and same-source WASM performance

Status: Task 16 evidence captured on 2026-08-09

## Decision

Keep the portable TypeScript implementation as the only production `pdq-v1` backend. Do not add,
package, or automatically select a WebAssembly backend.

The TypeScript core met every predeclared absolute latency budget in Node, Chromium, Firefox, and
WebKit. Total encoded-image adapter latency, Node peak memory, browser main-thread responsiveness,
and worker heartbeat delay also met every budget. The same-source WASM comparator was exactly
conformant, but it did not meet the separate advancement rule: with TypeScript inside budget, WASM
had to be at least 2x faster at both 2 MP and 12 MP. It missed that rule in Node and every browser;
in Firefox it was slower than TypeScript.

This is a benchmark decision, not a promise that TypeScript is faster on every device. A future
optional backend requires a new explicit proposal and measurements on representative target
hardware. It must never appear through silent runtime dispatch.

## Frozen budgets and decision rule

These values were recorded before retained measurements were reviewed:

| Workload | TypeScript core p95 | Adapter total p95 |
| --- | ---: | ---: |
| 500 x 500 (0.25 MP region) | 20 ms | 100 ms |
| 1600 x 1250 (2 MP scan) | 100 ms | 400 ms |
| 4000 x 3000 (12 MP image) | 500 ms | 2,000 ms |

- The 0.25 MP browser main-thread retained-operation maximum was 50 ms.
- The 2 MP and 12 MP browser cases ran in a dedicated worker; main-thread heartbeat-delay p95 was
  50 ms.
- The Node 12 MP incremental peak-RSS limits were 384 MiB for core and 512 MiB for the full adapter.
- The disposable WASM limit was 300 KiB raw, 150 KiB gzip, and 50 ms warm-initialization p95.
- WASM could advance only with exact hash and quality conformance and either a TypeScript core
  budget miss or at least 2x p95 speedup at both 2 MP and 12 MP.

## Method

The profile uses a versioned deterministic RGB8 pattern. Its three raw buffers have committed
SHA-256 checksums in the plan output. TypeScript and WASM receive the same buffer; equality of hash
and quality is checked before a timing is accepted. Each measurement has five warmups and 30
retained samples. Percentiles use nearest rank.

Adapter fixtures are lossless PNGs generated once, outside timing, with Sharp compression level 3.
The 12 MP fixture is about 18.6 MB and remains inside the public 32 MiB encoded-input limit. Decode,
core-after-decode, and end-to-end `fingerprintImage()` timings are retained separately. Node peak
RSS is collected in a fresh process for each workload/path. Larger browser work, including native
decode and hashing, runs in a dedicated worker while the page samples a 10 ms heartbeat.

The comparator is built from Meta ThreatExchange commit
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424` with pinned Emscripten 3.1.7 image digest
`sha256:6143f5b3d58fe6e7faf9f279d27ea9ea975983ee2b5490478abda126a6762f34` and
`-O3 -ffp-contract=off`. It exposes only raw RGB hashing, allocation, and memory. It is a disposable
development artifact and is excluded from the npm package.

## Captured environment

- Apple M1 Max, 10 logical CPUs, 64 GiB RAM, macOS arm64 25.5.0.
- Node 22.22.1, V8 12.4.254.21-node.35.
- Sharp 0.35.3 and libvips 8.18.3.
- Headless Chromium 151.0.7922.34, Firefox 153.0, and WebKit 26.5.

## Node results

Throughput is megapixels per second at the reported p95 latency.

| Workload | TS p50 / p95 | TS p95 MP/s | WASM p50 / p95 | WASM p95 MP/s | Decode p95 | Adapter p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.25 MP | 6.77 / 6.96 ms | 35.91 | 2.16 / 2.33 ms | 107.41 | 1.97 ms | 9.63 / 9.96 ms |
| 2 MP | 52.30 / 53.10 ms | 37.67 | 18.36 / 18.92 ms | 105.71 | 14.70 ms | 80.33 / 81.07 ms |
| 12 MP | 353.52 / 355.33 ms | 33.77 | 250.50 / 254.31 ms | 47.19 | 76.00 ms | 497.91 / 503.36 ms |

| Workload | Core incremental peak RSS | Adapter incremental peak RSS | WASM linear memory |
| --- | ---: | ---: | ---: |
| 0.25 MP | 4.17 MiB | 28.34 MiB | 16.00 MiB |
| 2 MP | 17.58 MiB | 64.36 MiB | 26.00 MiB |
| 12 MP | 94.41 MiB | 231.77 MiB | 130.94 MiB |

The 24,094-byte WASM asset is 11,643 bytes with gzip level 9. Node compilation took 0.20 ms and
warm initialization p95 was 0.84 ms. All artifact, initialization, latency, and memory budgets
passed. WASM speedup was about 2.81x at 2 MP but only 1.40x at 12 MP, so the Node advancement
decision was `insufficient-measured-benefit`.

## Browser results

The responsiveness column is maximum retained timed-operation sample for 0.25 MP and page heartbeat
delay p95 for the worker-based 2 MP and 12 MP cases.

| Engine | Workload | TS p50 / p95 | TS p95 MP/s | WASM p95 | Adapter total p95 | Responsiveness |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 0.25 MP | 6.98 / 7.22 ms | 34.65 | 2.26 ms | 10.10 ms | 11.79 ms max |
| Chromium | 2 MP | 53.18 / 54.19 ms | 36.91 | 18.95 ms | 81.37 ms | 2.05 ms p95 |
| Chromium | 12 MP | 340.69 / 480.84 ms | 24.96 | 254.95 ms | 481.83 ms | 1.08 ms p95 |
| Firefox | 0.25 MP | 8.36 / 8.82 ms | 28.34 | 17.34 ms | 11.54 ms | 17.60 ms max |
| Firefox | 2 MP | 64.74 / 65.84 ms | 30.38 | 144.16 ms | 105.46 ms | 6.36 ms p95 |
| Firefox | 12 MP | 301.14 / 306.14 ms | 39.20 | 871.18 ms | 532.64 ms | 5.04 ms p95 |
| WebKit | 0.25 MP | 2.86 / 3.18 ms | 78.62 | 2.30 ms | 9.04 ms | 9.16 ms max |
| WebKit | 2 MP | 21.48 / 22.80 ms | 87.72 | 18.76 ms | 56.80 ms | 5.98 ms p95 |
| WebKit | 12 MP | 234.98 / 241.24 ms | 49.74 | 261.44 ms | 408.40 ms | 6.00 ms p95 |

Every browser TypeScript, adapter, responsiveness, WASM artifact, and initialization budget passed.
WASM was exactly conformant in all nine engine/workload combinations, but no engine met the 2x rule
at both larger sizes. Browser-specific memory APIs were recorded as capability evidence only; they
are not compared across engines because their availability and semantics are not portable.

## Repeatability

The complete Node run's 2 MP case was repeated with the same five-warmup/30-sample profile. Relative
p95 changes were +0.2% for TypeScript core, +0.5% for WASM core, +13.2% for decode alone, and +0.2%
for total adapter latency. Decode is the noisiest isolated stage, while the product-facing core and
total measurements were stable enough to leave every budget and the backend decision unchanged.

## Limitations

- This is one named Apple Silicon host, not a population of phones, scanners, cloud instances, or
  thermal states.
- Synthetic inputs make byte identity and workload size reproducible; they are not a matching-quality
  corpus and do not predict application recall or precision.
- Headless browser timing may differ from foreground applications, mobile browsers, and throttled
  tabs.
- Lossless PNG isolates adapter overhead without decoder-tolerance noise. JPEG, WebP, ICC, and alpha
  behavior remain covered by the separate adapter-conformance corpus.
- The results justify the current TypeScript backend; they do not create permanent performance
  guarantees for future versions.

## Reproduction and raw evidence

```sh
wasm_dir=$(mktemp -d)
pnpm pdq:performance:wasm:build -- \
  --output "$wasm_dir" \
  --source /absolute/path/to/pinned/ThreatExchange

pnpm pdq:performance:node -- \
  --wasm "$wasm_dir/pdq-performance.wasm" \
  --output benchmarks/pdq/results/<node-profile>.json \
  --quiet

pnpm pdq:performance:browser -- \
  --wasm "$wasm_dir/pdq-performance.wasm" \
  --output benchmarks/pdq/results/<browser-profile>.json \
  --quiet
```

Plan inspection does not require a package build, WASM artifact, or browser launch:

```sh
node benchmarks/pdq/core-performance.mjs --plan-only
node benchmarks/pdq/browser-performance.mjs --plan-only
```

Raw reports:

- [Node full matrix](../../benchmarks/pdq/results/node-apple-m1-max-2026-08-09.json)
- [Browser full matrix](../../benchmarks/pdq/results/browser-apple-m1-max-2026-08-09.json)
- [Node 2 MP repeat](../../benchmarks/pdq/results/node-apple-m1-max-scan-2mp-repeat-2026-08-09.json)
