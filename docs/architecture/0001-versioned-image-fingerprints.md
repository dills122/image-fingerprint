# ADR 0001: Versioned Image Fingerprints

Status: proposed
Updated: 2026-08-07

## Context

The package currently exposes one unversioned hash string produced by a Block Mean Value algorithm.
Downstream systems may persist those strings, so silently replacing the implementation would change
the meaning of existing data.

The modernization research recommends evaluating PDQ as the first additional algorithm. PDQ has a
public algorithm description, canonical implementations, regression fixtures, a compact 256-bit
hash, and a quality score. It also has explicit limits: it is a copy-similarity signal rather than a
semantic or cryptographic hash, and deep cropping is outside its intended robustness envelope.

## Proposed Decision

Expand the package around versioned fingerprint results instead of replacing imageHash:

- Name existing behavior blockhash-v1 and preserve its exact serialized output.
- Introduce PDQ, if it passes the repository conformance and benchmark gates, as pdq-v1.
- Keep the legacy callback API as a compatibility adapter.
- Add a typed API whose result carries algorithm, hash, bit count, and optional quality.
- Keep raw-pixel algorithms independent of paths, URLs, MIME detection, and encoded-image decoders.
- Keep matching explicit: hashes from different algorithms cannot be compared.
- Launch new algorithms opt-in. A default change requires a separate migration decision.

The proposed result boundary is:

~~~ts
type FingerprintAlgorithm = 'blockhash-v1' | 'pdq-v1';

interface ImageFingerprint {
  algorithm: FingerprintAlgorithm;
  hash: string;
  bits: number;
  quality?: number;
}
~~~

This is a contract direction, not approval of a particular PDQ dependency or implementation.

## Compatibility Rules

- Existing imageHash inputs, callback behavior, and golden BMVB outputs remain locked.
- Persisted fingerprints created by new APIs include an algorithm identifier.
- Serialization or preprocessing changes require a new algorithm version.
- Decoder normalization—orientation, alpha background, grayscale, and channel order—is specified
  and tested separately from the algorithm core.
- Thresholds are named configuration/defaults backed by benchmark evidence, not properties hidden
  inside hash comparison.

## Verification Gates For A New Algorithm

1. Exact raw-pixel conformance against a pinned authoritative reference.
2. Decoder-level integration tolerance documented by format and runtime.
3. Positive and negative transformation benchmarks with threshold sweeps.
4. Determinism across supported Node versions and CI architectures.
5. License and fixture provenance review.
6. Compatibility proof showing blockhash-v1 is unchanged.

## Consequences

Positive:

- Stored hashes remain interpretable during dual-write and migration periods.
- New algorithms can be evaluated and shipped without a flag-day replacement.
- Decoder variance and algorithm variance become independently observable.
- Future crop-resistant or embedding algorithms have an explicit extension point.

Costs:

- Callers using new APIs must retain algorithm metadata.
- The package needs an algorithm registry/dispatch boundary and more fixture classes.
- Each algorithm version has a long-lived compatibility and documentation burden.

## Non-Goals

- Cryptographic integrity or proof that two files are identical.
- Semantic image search.
- Large-scale nearest-neighbor indexing.
- A claim that one global fingerprint handles deep crops or adversarial edits.
- Changing npm packaging or release policy as part of the algorithm feature.

## Related Material

- [Modernization specification](../modernization/image-hashing-modernization-spec.md)
- [PDQ reference material](../modernization/pdq-reference-material.md)
- [Benchmark requirements](../modernization/benchmark-requirements.md)
- [Implementation phase gates](../modernization/implementation-plan.md)

## Approval

- Decision owner: pending
- Accepted revision/date: pending
- Amendments: pending
