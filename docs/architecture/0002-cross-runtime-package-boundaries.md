# ADR 0002: Cross-Runtime Package Boundaries

Status: accepted
Updated: 2026-08-09

## Context

The existing package entrypoint combines the legacy Block Mean Value algorithm with Node.js file
loading, `Buffer`, MIME detection, and format-specific decoders. The algorithm itself only needs
decoded pixels, but importing the public entrypoint into a browser also pulls Node.js built-ins and
Node-oriented decoder implementations into the browser module graph.

PDQ is being evaluated as the first additional algorithm. Its raw-pixel implementation must be
usable and conformant in both Node.js and modern browsers from its first release. Decoder behavior
can vary between runtimes, so algorithm conformance and encoded-image integration need separate
boundaries and tests.

## Decision

- Keep the existing root entrypoint and callback behavior as the Node.js compatibility API.
- Add an explicit `image-fingerprint/node` alias for Node.js input and decoder behavior.
- Add `image-fingerprint/core` for runtime-neutral pixel algorithms, result types, and matching helpers.
- Add a browser-safe ESM entrypoint at `image-fingerprint/browser`.
- Preserve the previously reachable CommonJS `lib` runtime paths when introducing package exports;
  they remain compatibility paths rather than newly recommended public APIs.
- Define portable algorithm inputs as explicitly tagged, tightly packed sRGB typed-array pixels
  with width and height; do not expose Node.js or DOM types from the core. The current foundation
  starts with straight-alpha RGBA8, while an approved PDQ profile may add gray8 and RGB8 without
  changing the runtime boundary.
- Return schema-versioned fingerprint records that identify the algorithm, encoding, total bit
  length, and algorithm parameters required for safe comparison.
- Keep encoded-image loading, MIME detection, decoding, orientation, alpha, and color normalization
  in runtime adapters rather than algorithm implementations.
- Require browser package smoke tests to reject Node.js built-ins in the emitted browser graph and
  execute exact raw-pixel fixtures in Chromium, Firefox, WebKit, and a module worker.

The initial browser entrypoint accepts decoded pixels. Browser decoding adapters for `File`, `Blob`,
URLs, `ImageBitmap`, and `ImageData` can be added incrementally without changing the algorithm
contract.

## Consequences

Positive:

- PDQ candidates can be tested against identical raw pixels in Node.js and browsers.
- Existing Node.js consumers retain their callback API and serialized Block Mean Value hashes.
- Browser bundles do not include filesystem, `Buffer`, or Node-oriented decoder code.
- Decoder variance is measurable separately from algorithm variance.

Costs:

- The package publishes CommonJS compatibility output and browser ESM output.
- Encoded browser inputs require a separate adapter and a documented normalization policy.
- Node.js decoder dependencies remain installed by this single package even though browser bundles
  exclude them. A separate core package would be required to eliminate that install footprint.
- Published entrypoints and their declarations become long-lived compatibility contracts.

## Verification

- Existing Node.js golden hashes and callback tests remain unchanged.
- The same synthetic RGBA fixtures produce identical versioned results through the core, Node.js,
  and browser entrypoints.
- Isolated packed-package smoke tests load CommonJS and ESM root, Node.js, core, browser, historical
  `lib`, and package-metadata subpaths.
- Packed TypeScript consumers compile under `node16`, `nodenext`, and `bundler` resolution.
- Chromium, Firefox, and WebKit browser smoke tests load the packed ESM browser subpath, hash exact
  gray/RGB/RGBA fixtures on the main thread and in a module worker, and reject unexpected WASM.
- Static browser-graph checks reject Node.js built-ins.

## Sources

- [Node.js package entrypoints and conditional exports](https://nodejs.org/api/packages.html#package-entry-points)
- [Vite library mode](https://vite.dev/guide/build.html#library-mode)
- [TypeScript runtime library declarations](https://www.typescriptlang.org/tsconfig/lib.html)
- [Canvas RGBA pixel access](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [Playwright browsers](https://playwright.dev/docs/browsers)
- [Playwright continuous integration](https://playwright.dev/docs/ci)

## Related Material

- [Versioned fingerprint ADR](./0001-versioned-image-fingerprints.md)
- [Modernization specification](../modernization/image-hashing-modernization-spec.md)
