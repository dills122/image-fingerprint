# PDQ Performance Progress

## Log

- 2026-08-09: Fast-forwarded merged `main` through PR #12 and created
  `codex/pdq-performance-benchmarks` at `5b47fb7`.
- 2026-08-09: Audited Task 16, the current benchmark requirements, package scripts, pinned WASM
  oracle build, comparator, and raw C++ API.
- 2026-08-09: Froze latency, responsiveness, memory, artifact-size, and WASM escalation budgets
  before collecting performance measurements.
- Created `codex/pdq-performance-benchmarks` from merged main `5b47fb7`.
- Froze absolute latency, responsiveness, memory, artifact-size, and WASM advancement budgets.
- Added deterministic plan/checksum and nearest-rank metric regression tests.
- Added Node core/decode/decoded-core/adapter timing plus process-isolated peak-RSS collection.
- Added a pinned 24,094-byte in-process same-source WASM comparator; Node and browser exactness
  passed on every retained workload.
- Added browser main-thread and dedicated-worker harnesses; Chromium main-thread and all-engine
  2 MP worker/decode/WASM smokes passed.
- Retained the full 30-sample Node/browser reports and the repeated Node 2 MP result, then published
  p50/p95, throughput, memory, responsiveness, artifact size, limitations, and the TypeScript-only
  backend decision.
- Node 22/24 tests and package smoke, three-engine main-thread/worker smoke, pack verification, and
  the five-axis review passed.
