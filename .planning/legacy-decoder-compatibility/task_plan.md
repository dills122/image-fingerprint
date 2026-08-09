# Task Plan

Goal: Add an explicit Node-only historical decoder mode, consolidate legacy hashing onto the shared
pixel flow, and finish release documentation without breaking stored hashes or callback behavior.

## Phases

- [x] Phase 1: Audit the legacy and normalized pipelines and establish the compatibility boundary.
- [x] Phase 2: Add failing public-contract and differential tests.
- [x] Phase 3: Implement the compatibility decoder and BlockHash `fingerprintImage()` overload.
- [x] Phase 4: Consolidate the callback adapter without changing its contract.
- [x] Phase 5: Complete Task 18 release/migration documentation.
- [x] Phase 6: Run focused, full, packed-package, and browser verification.
- [ ] Phase 7: Review, commit, push, and prepare the PR.

## Decisions

- Normalized Sharp decoding remains the default.
- The explicit compatibility value is `decoderMode: 'image-hash-v7'`.
- Compatibility mode is Node-only and BlockHash-only.
- `imageHash()` remains and selects historical decoding automatically.
- Decoder/preprocessing provenance remains outside the fingerprint record schema for this change.
- Historical decoder and MIME packages are exact-pinned because semver ranges are incompatible with
  a versioned deterministic decoder promise.

## Risks

- JPEG decoders are not interchangeable; differential fixtures must remain in the gate.
- Historical decoder imports must not enter browser/core package graphs.
- `imageHash()` accepts legacy inputs and parameter cases that are broader than the new structured
  API, so adapter consolidation must not add modern validation to the old callback path.
