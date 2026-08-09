# Image Hashing Modernization

This directory holds the evidence and design contract for modernizing `image-hash` without silently
changing hashes already stored by consumers.

## Status

The PDQ core contract and dependency-ordered implementation plan are approved. Tasks 1–6 are
complete: the cross-runtime foundation, pinned oracle/corpus, normalized pixel boundary, and the
internal luminance/Jarosz/quality/DCT/median/hash stages are implemented. Public `pdq-v1` dispatch
and fingerprint records remain gated in Tasks 7–11.

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
- [Tooling baseline](./tooling-baseline.md): runtime, package-manager, compiler, lint, test, and CI
  foundation established before algorithm implementation.

## Workflow

1. Review and approve or amend the implementation plan.
2. Stabilize the cross-runtime foundation and build the pinned C++ oracle.
3. Implement the TypeScript core test-first against exact generated vectors.
4. Prove records, comparison, packaging, browsers, and workers.
5. Add encoded-image adapters, performance evidence, and product calibration behind later gates.
