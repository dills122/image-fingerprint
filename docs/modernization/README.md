# Image Hashing Modernization

This directory holds the evidence and design contract for modernizing `image-hash` without silently
changing hashes already stored by consumers.

## Status

The tooling baseline is implemented. The algorithm specification remains ready for maintainer
review; no new production algorithm has been selected or implemented.

## Documents

- [Versioned fingerprint ADR](../architecture/0001-versioned-image-fingerprints.md): proposed
  compatibility and extension contract for adding algorithms.
- [PDQ reference material](./pdq-reference-material.md): authoritative sources, algorithm details,
  implementation anchors, and conformance expectations.
- [Modernization specification](./image-hashing-modernization-spec.md): draft product and technical
  contract requiring approval before implementation planning.
- [Benchmark requirements](./benchmark-requirements.md): fixture classes, transformations, metrics,
  and acceptance evidence.
- [Implementation plan](./implementation-plan.md): provisional phase gates; detailed tasks are
  intentionally blocked on specification approval.
- [Tooling baseline](./tooling-baseline.md): runtime, package-manager, compiler, lint, test, and CI
  foundation established before algorithm implementation.

## Workflow

1. Review and amend the specification assumptions and open decisions.
2. Approve the specification.
3. Evaluate implementation candidates against the reference fixtures.
4. Approve an implementation and migration plan.
5. Produce tasks, implement, verify, and release in explicit stages.
