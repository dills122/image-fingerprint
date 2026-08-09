# Legacy Decoder Compatibility - Product Requirements Document (PRD)

## Requirements Description

### Background

- **Business problem:** Applications may already persist BlockHash strings produced by
  `image-hash@7.0.1`. Re-decoding the same JPEG with Sharp can change pixels and therefore change
  stored hash equality, even when the BlockHash algorithm and parameters are unchanged.
- **Target users:** Existing `image-hash` consumers migrating to `image-fingerprint`, plus new
  consumers that need controlled encoded-image normalization.
- **Value proposition:** Preserve exact historical results when explicitly requested while making
  normalized, oriented sRGB decoding the default for new applications.

### Feature Overview

- Add a Node-only, named `image-hash-v7` decoder compatibility mode for encoded-image BlockHash.
- Extend the Promise-based `fingerprintImage()` flow to support `blockhash-v1`.
- Keep normalized Sharp decoding as the default.
- Remove the callback, remote-request, MIME-extension, and internal deep-import compatibility
  surfaces from the new package.
- Route both modes through decoded pixels and the shared BlockHash implementation.

The feature does not make historical decoding available to PDQ, change stored fingerprint record
schemas, change browser decoding, or claim that different decoders produce identical pixels.

### User Scenarios

1. A new Node.js application calls `fingerprintImage()` without a mode and receives a versioned
   BlockHash record produced from normalized, oriented sRGB pixels.
2. A migrating application calls `fingerprintImage()` with `decoderMode: 'image-hash-v7'` and
   receives the exact BlockHash string it previously stored for the same supported encoded input
   and parameters.
3. A migrating application replaces the callback call with the Promise API and stores the returned
   versioned record plus decoder provenance.

### Detailed Requirements

- `fingerprintImage()` accepts either `pdq-v1` or `blockhash-v1` options.
- `decoderMode: 'image-hash-v7'` is valid only with `blockhash-v1` in the Node entrypoint.
- The default Node mode uses the existing Sharp normalization contract.
- Compatibility mode uses the historical JPEG, PNG, and WebP decoder implementations and does not
  apply EXIF orientation or ICC normalization that the old package did not apply.
- Unsupported combinations fail with a stable `invalid-input` preparation error.
- Limits, cancellation, format inspection, animation rejection, and source types remain supported.
- Consumers that persist fingerprints from encoded inputs are told to persist their decoder mode
  or normalization-pipeline version next to the fingerprint record.

## Design Decisions

### Technical Approach

- Use a discriminated option rather than a boolean so the compatibility target is versioned and
  self-documenting.
- Keep historical decoder code in a Node-only compatibility module.
- Reuse the current encoded-source reader and inspection/limit boundary.
- Convert historical decoded results to tightly packed RGBA pixels, then invoke the same shared
  BlockHash implementation used by `fingerprintPixels()`.
- Keep the old source loader and callback orchestration out of the new package.

### Constraints

- Exact `image-hash@7.0.1` BlockHash output is compatibility-locked through the named decoder mode.
- The modern default must retain auto-orientation and sRGB normalization.
- Browser entrypoints must not import Node or historical decoder dependencies.
- PDQ remains opt-in and normalized; compatibility mode cannot be selected for PDQ.
- This is deterministic image fingerprinting, not cryptographic or adversarial hashing.

### Risk Assessment

- **JPEG decoder variance:** Sharp differed from the historical decoder in 98 of 720 generated
  comparisons. Mitigation: retain `jpeg-js` in the named compatibility mode.
- **Dependency weight:** Historical decoder packages remain installed. Mitigation: isolate them
  behind the Node graph and keep browser package graph tests.
- **Ambiguous persistence:** Algorithm records do not currently encode preprocessing. Mitigation:
  document decoder-mode persistence now and evaluate a separate provenance schema later.
- **Contract drift:** The named mode could stop reproducing published results. Mitigation: committed
  golden fixtures and the frozen 720-case published-package digest cover JPEG, PNG, and WebP.

## Acceptance Criteria

### Functional Acceptance

- [x] Normalized `fingerprintImage()` supports versioned `blockhash-v1` results.
- [x] `decoderMode: 'image-hash-v7'` reproduces historical hashes on committed compatibility
  fixtures and generated codec stress cases.
- [x] The package root and Node entrypoint do not export the old callback API.
- [x] Compatibility mode is rejected for PDQ and unavailable from browser entrypoints.
- [x] Existing decoder limits, abort handling, errors, and animation rejection remain intact.

### Quality Standards

- [x] New behavior is introduced with failing tests before implementation.
- [x] Historical golden/differential tests and package graph checks remain green.
- [x] `pnpm check`, `npm pack --dry-run`, packed CommonJS/ESM/TypeScript smoke tests, and real-browser
  conformance pass.
- [x] Release documentation explains defaults, compatibility selection, persistence, decoder
  variance, and rollback.

### User Acceptance

- [x] A migration example maps old bits/method/source inputs to the Promise API.
- [x] A new-application example uses normalized decoding by default.
- [x] Documentation clearly states that decoder mode is part of encoded-image reproducibility.

## Execution Phases

### Phase 1: Contract and Differential Tests

- Add Node API type and runtime tests for both decoder modes.
- Add historical golden comparisons for decoder-sensitive fixtures.
- Confirm the new tests fail against the current implementation.

### Phase 2: Compatibility Decoder and Promise API

- Add the isolated historical encoded-image decoder.
- Extend Node `fingerprintImage()` to BlockHash and the named decoder mode.
- Preserve normalized decoding as the default and PDQ behavior unchanged.

### Phase 3: Legacy Surface Removal

- Remove callback/source-loading orchestration, request objects, MIME-extension matching,
  callback-only examples/tests, deep package aliases, and dependencies no longer used by the
  Promise API.
- Retain exact historical decoding only behind the named BlockHash decoder mode.

### Phase 4: Release Documentation and Verification

- Finish Task 18 API, migration, release, compatibility, attribution, and rollback documentation.
- Run all local, packed-package, and browser gates.

---

**Document Version**: 1.0
**Created**: 2026-08-09
**Clarification Rounds**: 3
**Quality Score**: 94/100
