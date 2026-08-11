# 0.1.1 Release Notes

Status: `0.1.1-rc.1` candidate preparation
Updated: 2026-08-10

## Summary

`0.1.1` retains the stable `blockhash-v1`, `pdq-v1`, decoder, codec, and comparison contracts while
making the quality-confirmed Crop-Local item-color matcher available for deliberate application
testing. Crop-Local is isolated at `image-fingerprint/experimental/crop-local`; importing a stable
entrypoint cannot select or expose it.

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

- [ ] Merge `0.1.1-rc.1` only after required CI and CodeQL checks pass.
- [ ] Confirm `pnpm check` passes on the release commit.
- [ ] Confirm `pnpm pack:check` includes the experimental CommonJS, ESM, and declaration files.
- [ ] Confirm packed consumers resolve the subpath under CommonJS, ESM, Node16, NodeNext, and
  bundler TypeScript modes.
- [ ] Confirm the browser package smoke contains no Node-only imports.
- [ ] Tag the exact merged commit as `v0.1.1-rc.1` and publish with the `next` dist-tag.
- [ ] Run application-level end-to-end trials without treating preview fingerprints as durable.
- [ ] Promote to `0.1.1` only after release-candidate feedback and required checks are reviewed.

## References

- [Experimental package-surface decision](../architecture/0008-crop-local-experimental-package-surface.md)
- [Crop-Local retained evidence](./crop-local-v0-results.md)
- [Crop-Local retrieval limits](./crop-local-item-color-retrieval-results.md)
- [MTG fallback holdout](../architecture/0007-crop-local-card-recall-development.md)
