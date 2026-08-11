# 0.1.1 Release Notes

Status: stable release preparation
Updated: 2026-08-10

## Summary

`0.1.1` retains the stable `blockhash-v1`, `pdq-v1`, decoder, codec, and comparison contracts while
making the quality-confirmed Crop-Local item-color matcher available for deliberate application
testing. Crop-Local is isolated at `image-fingerprint/experimental/crop-local`; importing a stable
entrypoint cannot select or expose it.

`0.1.1-rc.0` was published under the `next` dist-tag with npm provenance. The subsequent
experimental package-surface change was merged to `main` at `2103800` after CI and CodeQL passed.
Although that commit used an intermediate `0.1.1-rc.1` manifest, it was not tagged or published;
stable `0.1.1` incorporates the change directly.

## Experimental Crop-Local Preview

The preview includes:

- verbose and packed fingerprint generation from decoded `rgba8` pixels;
- directional source-to-crop comparison with `match`, `no-match`, and `insufficient-evidence`;
- exact pack/unpack transport and runtime validation; and
- CommonJS, ESM, TypeScript, Node, browser, and worker-compatible pure TypeScript output.

The preview excludes:

- stable `ImageFingerprint` and `FingerprintAlgorithm` integration;
- stable parsing and serialization;
- encoded-image convenience functions;
- the benchmark-only 500-reference retrieval index; and
- the MTG-specific development fallback, which failed its normalized-capture holdout floor.

Experimental names, types, shapes, profile identifiers, defaults, thresholds, and encodings may
change or disappear in any release. Persisted preview data should be tagged with both the profile
and package version and treated as regenerable.

## Evidence And Limits

The unchanged item-color policy passed one independent 500-source holdout with 745/1,500 true
positives and 5/144,550 reported false positives: 49.7% recall, 99.3% precision, and a 0.00346%
represented false-positive rate. The compact transport retained exact values and decisions and
measured 25,365/29,589 bytes p50/p95 on the procedural performance fixture, versus
49,940/56,284 bytes for the earlier verbose baseline.

This evidence does not establish universal accuracy, production index scale, or item identity.
Callers must calibrate decisions on their own data, keep insufficient evidence distinct, and treat
matches as visual consistency rather than proof that two products or records are identical.

## Stable Compatibility

- Existing `blockhash-v1` and `pdq-v1` output is unchanged.
- Schema version 1, fingerprint serialization, parsing, Hamming comparison, and PDQ policy are
  unchanged.
- Node and browser decoding behavior, `image-hash@7` migration mode, runtime support, and package
  entrypoints are unchanged.
- No stable entrypoint re-exports an experimental Crop-Local symbol.

## Release Checklist

- [x] Publish `0.1.1-rc.0` under `next` with npm provenance.
- [x] Merge the experimental package surface only after required CI and CodeQL checks pass.
- [x] Confirm the latest pre-release `main` commit includes the explicit experimental entrypoint.
- [x] Confirm `pnpm check` passes for the stable release change.
- [x] Confirm `pnpm pack:check` includes the experimental CommonJS, ESM, and declaration files.
- [x] Confirm packed consumers resolve the subpath under CommonJS, ESM, Node16, NodeNext, and
  bundler TypeScript modes.
- [x] Confirm the browser package smoke contains no Node-only imports.
- [x] Confirm packed Chromium, Firefox, and WebKit consumers pass in the main thread and a module
  worker.
- [ ] Run application-level end-to-end trials without treating preview fingerprints as durable.
- [ ] Merge the stable version change after required CI and CodeQL checks pass.
- [ ] Create a signed `v0.1.1` tag on the exact merged release commit.
- [ ] Confirm the release workflow publishes `0.1.1` under `latest` with npm provenance and creates
  the GitHub release.

The prepared `0.1.1` npm dry-run contains 180 files, is 183,594 bytes compressed and 871,712 bytes
unpacked, and has shasum `c7ae7de76f8c49f977bb3942158c061ab198ba05`.

## References

- [Experimental package-surface decision](../architecture/0008-crop-local-experimental-package-surface.md)
- [Crop-Local retained evidence](./crop-local-v0-results.md)
- [Crop-Local retrieval limits](./crop-local-item-color-retrieval-results.md)
- [MTG fallback holdout](../architecture/0007-crop-local-card-recall-development.md)
