# Repository Scope And Priorities

`image-hash` is a published Node.js/TypeScript library for deterministic image fingerprinting.

Primary deliverables:

- a stable compatibility implementation of the existing Block Mean Value hash
- well-defined public input, decoding, fingerprint, and comparison contracts
- evidence-backed modernization paths for additional versioned algorithms such as PDQ

Core priorities:

- stable serialized hashes and explicit migrations for intentional changes
- representative accuracy and performance measurements before algorithm decisions
- stable typed contracts between pure algorithms and I/O/decoder adapters
- maintainable local and CI workflows

## Active Boundaries

- `src/block-hash.ts` owns the legacy algorithm and must remain deterministic for golden fixtures.
- `src/index.ts` owns current public input orchestration; new algorithm cores must not absorb I/O.
- `__tests__/` owns compatibility evidence and focused behavioral fixtures.
- `docs/modernization/` owns proposed contracts, reference evidence, benchmarks, decisions, and plans.

## Safe Refactor Boundaries

Do not refactor these without explicit instruction:

- published package entrypoints and CommonJS/ESM compatibility
- existing callback API behavior
- legacy hash bytes/hex serialization or interpretation of the `bits` parameter
- golden expected hashes used by downstream consumers

Safe default changes:

- documentation and benchmark scaffolding
- additive typed contracts behind non-default APIs
- focused test additions and reproducible local tooling
- input validation and resource limits that preserve documented valid inputs
