# Changelog

All notable changes to `image-fingerprint` are documented here.

## Unreleased

- Expand the packed-package browser and module-worker gate to cover the experimental Crop-Local
  verbose and packed profiles across four deterministic RGBA fixture classes.
- Require exact fingerprints and decision fields across Node, Chromium, Firefox, and WebKit while
  keeping floating-point diagnostic evidence outside the cross-runtime serialization contract.
- Add a deterministic 500-to-2,000-reference retrieval scaling harness with index size, memory,
  selectivity, latency, and exact round-trip ranking evidence.
- Retain the full-sort research ranker after an exact bounded top-50 heap increased measured query
  latency, and report evidence coverage independently from the returned candidate limit.
- Add an internal schema-v2 columnar delta-varint posting representation that retains schema-v1
  loading and exact rankings while reducing the measured 2,000-reference index by 65.9%.
- Retain compact full-sort querying after an exact WAND candidate reduced fully scored references
  but increased 2,000-reference p50 latency by roughly 75 times.

## 0.1.1 - 2026-08-10

- Add the explicit `image-fingerprint/experimental/crop-local` preview entrypoint.
- Expose the independently validated item-color generator, directional tri-state comparator, and
  exact packed transport without changing stable fingerprint schemas or entrypoints.
- Add bounded crop-aware fingerprint research implementations and reproducible benchmark evidence.
- Keep the research retrieval index and failed MTG-specific recall fallback internal.
- Document experimental compatibility, measured quality, storage, scaling, and product-identity
  limitations.
- Stabilize required CI and CodeQL checks while reducing unnecessary expensive work.

See [the complete 0.1.1 release notes](./docs/releases/0.1.1.md).

## 0.1.1-rc.0 - 2026-08-10

- Add bounded crop-aware fingerprint research implementations and reproducible benchmark evidence.
- Document why the current crop-aware candidates remain outside the supported public profile.
- Stabilize the required CI and CodeQL check contracts while selectively running expensive jobs.
- Speed up the PDQ oracle path used by continuous integration.

## 0.1.0 - 2026-08-10

- Initial public release.
- Add versioned `blockhash-v1` and `pdq-v1` fingerprints.
- Add exact `image-hash@7` decoder compatibility through an explicit Node-only mode.
- Add strict serialization, parsing, comparison, and explicit PDQ policy helpers.
- Add Node.js and browser encoded-image adapters with bounded decoding.
- Add a project site with an interactive browser fingerprint playground.
- Add CommonJS, ESM, TypeScript, browser, worker, ARM64 oracle, package-integrity, and CodeQL gates.
- Start a new package and version line without the legacy callback, remote-request, or historical
  `lib/*` deep-import surface.

See [the complete 0.1.0 release notes](./docs/modernization/release-notes-0.1.0.md).
