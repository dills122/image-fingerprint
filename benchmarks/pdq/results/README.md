# PDQ adapter differential results

This directory preserves named-host outputs from the opt-in encoded-image adapter differential
suite. Results are evidence for a particular operating system, architecture, Node version, native
decoder build, and browser-engine build; they are not universal golden answers.

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
