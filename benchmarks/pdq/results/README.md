# PDQ retained benchmark results

This directory preserves named-host outputs from opt-in PDQ conformance, performance, and matching
benchmarks. Results are evidence for a particular corpus, operating system, architecture, runtime,
and decoder build; they are not universal golden answers.

Regenerate a result only after building the pinned C++ oracle described in
`../../../tools/pdq-oracle/README.md`:

```sh
pnpm pdq:adapter:differential -- \
  --oracle /outside-repository/pdq-oracle/pdq-oracle \
  --output benchmarks/pdq/results/<host-profile>.json
```

The command exits nonzero when exact repeatability or Node-to-C++ equality fails, or when a browser
distance exceeds both the initial gate and any narrowly bounded documented exception in the corpus
manifest. Reports retain the initial-gate outcome even when a documented exception is accepted.

`mtg-solring-node24-2026-08-09.json` is a matching-calibration report derived from a local-only,
pinned CC BY-SA 4.0 dataset clone. It retains hashes, qualities, distances, labels, metrics, and
provenance but no source image bytes. See
[`docs/modernization/pdq-matching-results.md`](../../../docs/modernization/pdq-matching-results.md).
