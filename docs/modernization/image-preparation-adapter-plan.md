# Image Preparation And Runtime Adapter Plan

Status: implementation in progress on `codex/image-preparation-adapters`
Updated: 2026-08-09

## Goal

Provide an ergonomic decode-once/hash-many path for full images and caller-selected MTG regions,
without changing the legacy callback API or moving encoded-image behavior into the deterministic
algorithm core.

## Dependency Boundary

This work is based directly on Task 7 commit `3b317827`. It does not implement or amend Tasks 8–10.
It shares core export/type files with those tasks, so integration must be serialized. Publishing the
browser adapter still depends on Task 11 real-engine, worker, and packed-resolution evidence.

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
- [ ] Run the contract in Chromium, Firefox, and WebKit on the main thread and in a worker after
  Task 11 supplies the browser harness and support floors.

### A5. Packaging and documentation

- [x] Make `/node` a real decoder-bearing entrypoint while preserving the root.
- [x] Mark package modules side-effect-free and keep Sharp out of browser/core ESM graphs.
- [x] Add packed CommonJS, ESM, Node decoder, and forbidden-browser-import smoke checks.
- [x] Document decode-once/hash-many examples and the exact determinism boundary.

### A6. Release evidence

- [ ] Run Task 11 real-browser/worker and TypeScript-resolution verification.
- [ ] Run Task 15 encoded decoder-tolerance corpus by format, orientation, alpha, ICC, and runtime.
- [ ] Record p50/p95 decode time, core time, memory, and browser responsiveness under Task 16.
- [ ] Merge only after shared Task 8–11 export conflicts are reconciled and all gates pass.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:package
pnpm check
```

Release evidence must include unchanged legacy golden hashes and callback tests, exact raw-pixel PDQ
fixtures, the browser forbidden-import scan, and the pending real-engine/worker results.
