# Repository Scope And Priorities

`image-fingerprint` is a Node.js/TypeScript library for deterministic, versioned image
fingerprinting.

Primary deliverables:

- stable Block Mean Value and PDQ fingerprint implementations with explicit algorithm identifiers
- exact `image-hash@7` stored-hash migration through the named Node-only decoder mode
- well-defined public input, decoding, fingerprint, and comparison contracts
- evidence-backed modernization paths for additional versioned algorithms such as PDQ

Core priorities:

- stable serialized hashes and explicit migrations for intentional changes
- representative accuracy and performance measurements before algorithm decisions
- stable typed contracts between pure algorithms and I/O/decoder adapters
- maintainable local and CI workflows

## Active Boundaries

- `src/block-hash.ts` owns the internal BlockHash calculation and must remain deterministic for
  golden fixtures.
- `src/core/` owns runtime-neutral pixel algorithms, records, comparison, and policy.
- `src/node/` owns filesystem input and normalized or historical decoder selection.
- `__tests__/` owns compatibility evidence and focused behavioral fixtures.
- `docs/modernization/` owns proposed contracts, reference evidence, benchmarks, decisions, and plans.

## Safe Refactor Boundaries

Do not refactor these without explicit instruction:

- published package entrypoints and CommonJS/ESM compatibility
- versioned public APIs, decoder-mode identifiers, and package entrypoints
- legacy hash bytes/hex serialization or interpretation of BlockHash parameters
- golden expected hashes used by downstream consumers

Safe default changes:

- documentation and benchmark scaffolding
- additive typed contracts behind explicit algorithm or decoder identifiers
- focused test additions and reproducible local tooling
- input validation and resource limits that preserve documented valid inputs
