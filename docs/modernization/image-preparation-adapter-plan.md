# Image Preparation And Runtime Adapter Plan

Status: Tasks 12–14 implemented and verified on `codex/image-preparation-adapters`; Task 15 open
Updated: 2026-08-09

## Goal

Provide an ergonomic decode-once/hash-many path for full images and caller-selected MTG regions,
without changing the legacy callback API or moving encoded-image behavior into the deterministic
algorithm core.

## Dependency Boundary

This work was designed from Task 7 commit `3b317827`, then rebased onto the authoritative Tasks
8–11 tip `631ac3f`. The shared exports, packed consumers, and browser harness now preserve Tasks
8–11 while adding the adapter surface. Task 15 decoder-tolerance evidence remains separate.

```text
Task 7 pixel fingerprint dispatch
  -> shared decoder contract and strict region extraction
      -> browser-safe encoded header inspection
          -> Node/Sharp and browser-native adapters
              -> packed graph and compatibility proof

Task 11 real-browser/worker proof
  -> adapter integration/release
      -> Task 15 decoder-tolerance evidence
```

## Implementation Tasks

### A1. Shared core contract and region extraction

- [x] Add runtime-neutral decoder options, error codes, defaults, and generic adapter interface.
- [x] Add strict, non-mutating `extractPixelRegion()` for gray8, rgb8, and rgba8.
- [x] Preserve tightly packed output and clamped RGBA storage.
- [x] Add source, bounds, type, and no-mutation tests.

### A2. Shared encoded-image inspection

- [x] Detect JPEG, PNG, and WebP from bytes rather than names or MIME hints.
- [x] Read dimensions before decoder allocation.
- [x] Detect APNG and animated WebP before implicit frame selection.
- [x] Keep this module free of Node.js and DOM imports.

### A3. Node adapter

- [x] Pin Sharp 0.35.3 and load it only when `decodeImage()` is called.
- [x] Support paths, `file:` URLs, `Uint8Array`, and Buffer-compatible input.
- [x] Apply orientation, convert to sRGB, retain straight alpha, and return RGBA8.
- [x] Verify path/byte parity, orientation, alpha, limits, errors, abort, and composition.
- [ ] Add licensed ICC/profile fixtures to the adapter differential corpus.

### A4. Browser adapter

- [x] Add zero-copy `pixelsFromImageData()`.
- [x] Decode `Blob` and `File` with native bitmap/canvas APIs and release resources.
- [x] Avoid top-level `window` or `document` access and prefer `OffscreenCanvas`.
- [x] Unit-test native orchestration, errors, limits, animation rejection, and composition.
- [x] Run `ImageData`, `Blob`, and `File` through Chromium 151, Firefox 153, and WebKit 26.5 on the
  main thread and in a module worker using the packed package.

### A5. Packaging and documentation

- [x] Make `/node` a real decoder-bearing entrypoint while preserving the root.
- [x] Mark package modules side-effect-free and keep Sharp out of browser/core ESM graphs.
- [x] Add packed CommonJS, ESM, Node decoder, and forbidden-browser-import smoke checks.
- [x] Document decode-once/hash-many examples and the exact determinism boundary.

### A6. Release evidence

- [x] Run Task 11 real-browser/worker and TypeScript-resolution verification after rebasing onto
  `631ac3f`.
- [ ] Run Task 15 encoded decoder-tolerance corpus by format, orientation, alpha, ICC, and runtime.
- [ ] Record p50/p95 decode time, core time, memory, and browser responsiveness under Task 16.
- [x] Reconcile shared Task 8–11 exports, packed consumers, documentation, and browser harness; run
  the full Node 22 gate and the real-engine adapter matrix.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:package
pnpm check
```

Release evidence includes unchanged legacy golden hashes and callback tests, exact raw-pixel PDQ
fixtures, the browser forbidden-import scan, and real-engine/worker adapter results. Task 15 still
owns cross-decoder tolerance and ICC/profile corpus evidence.
