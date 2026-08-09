# Findings

## Sources

- Wizards Fan Content Policy: https://company.wizards.com/en/legal/fancontentpolicy
- Wizards Terms: https://company.wizards.com/en/legal/terms
- HanClinto Sol Ring Dataset: https://huggingface.co/datasets/HanClinto/solring-eval
- Dataset revision: `11f4c7ba2201dfc67df88093ed49ca8013f23b14`

## Notes

- Task 17 is defined in `docs/modernization/implementation-plan.md`.
- Expected output files are `benchmarks/pdq/matching-quality.mjs`, `benchmarks/pdq/fixtures/manifest.json`, and `docs/modernization/pdq-matching-results.md`.
- Existing `benchmarks/pdq/fixtures/manifest.json` belongs to adapter conformance and must be evaluated before changing its schema.
- The Sol Ring Dataset supplies 307 real-camera frames, 21 printing identities, normalized card
  corners, and CC BY-SA 4.0 attribution. It is specifically designed around difficult same-art
  edition discrimination.
- Wizards identifies cards, artwork, graphics, and related material as Wizards IP. Keeping all
  corpus image bytes outside this repository avoids presenting those bytes as MIT package content.
- The prepared corpus generated 992 comparisons: 572 positives, 420 hard negatives, and equal
  full-image/crop-region scope counts.
- At distance 31 and quality 50, crop-region precision was 95.74% but recall was 15.73%; full-frame
  recall was 0.35%. Unrectified camera frames are not a suitable standalone PDQ input.
- Every measured fingerprint had quality 100, so the minimum-quality sweep had no effect and did
  not empirically calibrate the quality cutoff.

## Open Questions

- A broader corpus with multiple card names, reference images, devices, sleeves, foils, languages,
  and deliberately low-information captures is still needed for an application release threshold.
