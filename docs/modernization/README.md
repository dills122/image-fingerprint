# Image Hashing Modernization

This directory holds the evidence and design contract for building `image-fingerprint` from the
legacy `image-hash` baseline without silently changing hashes used for parity during the
pre-release transition.

## Status

The PDQ core and adapter contracts are approved. Tasks 1–14 are implemented and verified: the
cross-runtime core, record/comparison APIs, packed runtime matrix, and Node/browser image adapters
are complete. Task 15 retains cross-decoder tolerance and ICC/profile corpus evidence.

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
- [Tooling baseline](./tooling-baseline.md): runtime, package-manager, compiler, lint, test, and CI
  foundation established before algorithm implementation.

## Workflow

1. Review and approve or amend the implementation plan.
2. Stabilize the cross-runtime foundation and build the pinned C++ oracle.
3. Implement the TypeScript core test-first against exact generated vectors.
4. Prove records, comparison, packaging, browsers, and workers.
5. Add encoded-image adapters, performance evidence, and product calibration behind later gates.
