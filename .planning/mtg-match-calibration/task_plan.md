# Task Plan

Goal: Calibrate the opt-in PDQ match policy on a redistribution-safe MTG corpus for full-image and caller-produced cropped-region fingerprints, without adding crop selection or MTG-specific policy to the library core.

## Phases

- [x] Phase 1: Audit existing comparison contracts, fixtures, and benchmark conventions.
- [x] Phase 2: Research and select a redistribution-safe corpus strategy with explicit provenance.
- [x] Phase 3: Specify the manifest, pair labels, transformations, metrics, and review artifacts.
- [x] Phase 4: Implement the offline calibration runner and focused tests.
- [x] Phase 5: Assemble or generate the approved corpus and run threshold sweeps.
- [x] Phase 6: Review hard cases and document recommended starting values and limitations.
- [ ] Phase 7: Run the full quality gate, review the diff, and package the PR.

## Decisions

- Task 17 covers both full-image pairs and caller-produced crop-region pairs.
- Card detection and crop-selection logic remain outside the package core.
- Application-specific thresholds remain caller-controlled.
- No third-party image is committed until its redistribution terms and provenance are verified.
- The source corpus stays local-only even though its publisher applies CC BY-SA 4.0; retained
  repository evidence contains fingerprints, distances, metrics, labels, and provenance only.
- The first calibration goal is exact-printing discrimination on same-art Sol Ring printings.
- The existing `{ maxDistance: 31, minQuality: 50 }` remains a conservative opt-in starting point;
  the camera corpus does not justify a hidden or universal product threshold.

## Risks

- MTG card art, frames, symbols, and photography can have different rights holders and redistribution terms.
- A synthetic-only corpus would be redistribution-safe but may not represent real scanner behavior.
- Runtime downloads can make benchmarks irreproducible and may violate provider usage terms.
- Small or biased corpora can produce misleading threshold recommendations.
