# Image Hashing Modernization

This directory holds the evidence and design contract for building `image-fingerprint` from the
legacy `image-hash` baseline without silently changing hashes used for parity during the
pre-release transition.

## Status

The PDQ core and adapter contracts are approved. Tasks 1–17 are implemented and verified: the
cross-runtime core, record/comparison APIs, packed runtime matrix, and Node/browser image adapters
are complete, and encoded-image decoder tolerance is measured with a documented Firefox Display P3
exception. TypeScript/WASM performance and the initial MTG exact-printing calibration are retained
as evidence. Task 18 remains for final release and migration documentation.

## Documents

- [Versioned fingerprint ADR](../architecture/0001-versioned-image-fingerprints.md): accepted
  compatibility and extension contract for adding algorithms.
- [Cross-runtime package ADR](../architecture/0002-cross-runtime-package-boundaries.md): accepted
  Node.js, browser, and portable-core entrypoint boundaries.
- [PDQ reference material](./pdq-reference-material.md): authoritative sources, algorithm details,
  implementation anchors, and conformance expectations.
- [PDQ contract research](./pdq-contract-research.md): approved normalized-pixel
  and record contracts, library survey, and remaining implementation spikes.
- [Modernization specification](./image-hashing-modernization-spec.md): approved product and
  technical contract for implementation planning.
- [Benchmark requirements](./benchmark-requirements.md): fixture classes, transformations, metrics,
  and acceptance evidence.
- [Implementation plan](./implementation-plan.md): dependency-ordered tasks, acceptance criteria,
  verification commands, checkpoints, risks, and remaining release decisions.
- [Image preparation and adapter plan](./image-preparation-adapter-plan.md): approved shared helper,
  Node/Sharp, browser-native, packaging, and release-gate work kept separate from Tasks 8–11.
- [PDQ adapter conformance](./pdq-adapter-conformance.md): encoded-image corpus, reference boundary,
  cross-decoder distance evidence, and the bounded ICC/color-management exception.
- [PDQ performance results](./pdq-performance-results.md): Node/browser measurements and the
  evidence-backed decision to retain the portable TypeScript backend.
- [PDQ MTG matching results](./pdq-matching-results.md): local-only licensed corpus, threshold
  sweeps, hard cases, and conservative full-image/crop-region usage guidance.
- [Tooling baseline](./tooling-baseline.md): runtime, package-manager, compiler, lint, test, and CI
  foundation established before algorithm implementation.

## Workflow

1. Review and approve or amend the implementation plan.
2. Stabilize the cross-runtime foundation and build the pinned C++ oracle.
3. Implement the TypeScript core test-first against exact generated vectors.
4. Prove records, comparison, packaging, browsers, and workers.
5. Measure encoded-image adapters, then add performance evidence and product calibration behind
   later gates.
