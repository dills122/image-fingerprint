# PDQ Adapter Tolerance Findings

## Sources

- Meta ThreatExchange pinned commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`,
  `pdq/cpp/Makefile`: the upstream build bundles `CImg.h` but tells integrators to replace it with
  their own system decoder and edit `io/pdqio.cpp`.
- Meta ThreatExchange repository license: PDQ is BSD-licensed, with `pdq/cpp/CImg.h` called out as
  the image-I/O licensing exception.
- Local `tools/pdq-oracle/README.md`: the project oracle deliberately excludes CImg and all encoded
  image handling; its contract begins at tightly packed gray8/rgb8 pixels.

## Notes

- Branch starts from merged `origin/main` commit `5077158`.
- Tasks 12-14 are merged; Task 15 is the next incomplete modernization task.
- A raw C++ oracle alone cannot measure decoder variance. The scientifically separable reference is
  pinned Sharp decode/normalization into RGBA8, deterministic white compositing to RGB, then the
  pinned C++ hash. Exact Node TypeScript-vs-C++ agreement proves the core; browser-vs-reference
  distance measures the combined browser decoder/color/alpha effect.

## Open Questions

- Which existing repository fixtures have sufficient redistribution or generated provenance?
- Which browser outputs are stable across supported host operating systems versus only within the
  current macOS evidence environment?
