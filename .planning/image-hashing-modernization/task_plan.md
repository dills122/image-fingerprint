# Image Hashing Modernization Plan

Status: specification drafting
Task ID: `image-hashing-modernization`
Updated: 2026-08-07

## Goal

Define a compatibility-safe path from the package's legacy Block Mean Value hash toward a modern,
versioned image-fingerprinting API, using PDQ as the first candidate and measured behavior as the
decision mechanism.

## Working Rules

- Preserve the current `imageHash` API and exact BMVB output until an approved migration says
  otherwise.
- Separate encoded-image loading and decoding from raw-pixel hashing.
- Treat algorithm identifier, serialized hash, quality, and matching threshold as public contracts.
- Do not implement a new algorithm before the draft specification is reviewed.
- Prefer authoritative source code and fixtures over third-party package descriptions.

## Phases

### 0. Integrate AI Central — complete

- [x] Select `base` and `javascript-typescript` profiles.
- [x] Select `core`, `planning`, and `workflow` skill bundles.
- [x] Add a reproducible link-mode setup wrapper.
- [x] Add repository-specific agent and quality guidance.
- [x] Record the reviewed AI Central revision.

### 1. Specify — in progress

- [x] Inspect the current API, implementation boundaries, tests, and package metadata.
- [x] Identify authoritative PDQ algorithm, implementation, fixture, and threshold references.
- [x] Record the reference hierarchy and conformance expectations.
- [x] Draft product/API/testing boundaries and success criteria.
- [ ] Obtain human review of assumptions and open decisions.

### 2. Plan — pending specification approval

- [ ] Turn the approved specification into a dependency and architecture plan.
- [ ] Decide port, WASM adapter, native binding, or audited third-party package.
- [ ] Define decoder normalization, runtime targets, and packaging strategy.
- [ ] Define migration and rollout stages.

### 3. Tasks — pending plan approval

- [ ] Produce implementation-sized tasks with verification commands and ownership boundaries.
- [ ] Identify which tasks can run independently.

### 4. Implement — pending task approval

- [ ] Lock legacy contracts and baseline benchmarks.
- [ ] Implement the selected raw-pixel PDQ core/adapter.
- [ ] Add decoder adapters and public versioned API.
- [ ] Run conformance, metamorphic, performance, and compatibility tests.
- [ ] Document migration and release policy.

## Review Gate

No PDQ production implementation work should begin until the draft specification in
`docs/modernization/image-hashing-modernization-spec.md` is approved or amended by a maintainer.
