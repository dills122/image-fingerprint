# Findings

## Sources

- Repository contracts: `AGENTS.md`, README, ADRs 0001-0003, modernization specification, and
  implementation plan.
- Current implementations: `src/index.ts`, `src/block-hash.ts`, `src/core/fingerprint.ts`,
  `src/node/decode-image.ts`, and adapter contracts.

## Notes

- Both legacy and structured BlockHash paths already call `src/block-hash.ts`; decoder semantics are
  the material compatibility boundary.
- Normalized Sharp decoding matched 54/60 committed fixture/configuration comparisons. EXIF
  orientation changed four and Display-P3 conversion changed two.
- Sharp with orientation disabled and ICC ignored matched a focused 32/32 set, but a generated
  720-case stress comparison found 98 JPEG mismatches. PNG and WebP happened to match in that
  generated set, but the historical decoder dependencies remain the only defensible exact contract.
- The new decoder supports paths, file URLs, and encoded `Uint8Array` values; remote fetching and
  request objects remain features of the callback compatibility adapter.
- `fingerprintImage()` is currently PDQ-only even though `fingerprintPixels()` supports BlockHash.

## Open Questions

- Whether a future record schema should carry preprocessing provenance is intentionally deferred.
- Complete removal of historical decoding requires a major migration or abandonment of exact
  `image-hash@7.0.1` stored-hash compatibility.
