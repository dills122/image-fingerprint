# Task Plan

Goal: Add an explicit Node-only historical decoder mode, consolidate historical hashing onto the
shared pixel flow, and finish release documentation without breaking stored hashes.

## Phases

- [x] Phase 1: Audit the legacy and normalized pipelines and establish the compatibility boundary.
- [x] Phase 2: Add failing public-contract and differential tests.
- [x] Phase 3: Implement the compatibility decoder and BlockHash `fingerprintImage()` overload.
- [x] Phase 4: Prove the callback adapter and new Promise flow produce identical stored hashes.
- [x] Phase 5: Complete Task 18 release/migration documentation.
- [x] Phase 6: Run focused, full, packed-package, and browser verification.
- [x] Phase 7: Remove the callback-era API, loaders, deep imports, dependencies, tests, and docs
  while retaining `decoderMode: 'image-hash-v7'` compatibility.
- [ ] Phase 8: Review, commit, push, and open the draft PR. (Review complete; publishing remains.)

## Decisions

- Normalized Sharp decoding remains the default.
- The explicit compatibility value is `decoderMode: 'image-hash-v7'`.
- Compatibility mode is Node-only and BlockHash-only.
- Decoder/preprocessing provenance remains outside the fingerprint record schema for this change.
- Historical decoder packages are exact-pinned because semver ranges are incompatible with a
  versioned deterministic decoder promise.
- The published `image-fingerprint` API does not retain the `image-hash` callback surface. Existing
  stored hashes migrate through the Promise API's named historical decoder mode.

## Risks

- JPEG decoders are not interchangeable; differential fixtures must remain in the gate.
- Historical decoder imports must not enter browser/core package graphs.
- The historical policy must remain isolated from normalized decoding and unavailable to PDQ or the
  browser graph.
