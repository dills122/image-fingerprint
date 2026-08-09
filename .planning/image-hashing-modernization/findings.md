# Image Hashing Modernization Findings

Updated: 2026-08-09

## Repository Baseline

- The package is a Node.js/TypeScript wrapper around a Block Mean Value hash implementation.
- `src/index.ts` currently combines input loading, MIME detection, decoding, and hashing.
- The public API is callback-based and accepts paths, remote URLs/request objects, and buffers.
- Golden tests encode exact legacy 256-bit BMVB strings. These are compatibility contracts.
- The current decoder stack is `jpeg-js`, `pngjs`, and `@cwasm/webp`.
- Remote tests depend on live BBC URLs and should not be the only compatibility evidence.
- `file-type@21` implies a modern Node runtime even though `package.json` does not declare engines.

## Task 7 Dispatch Seam

- The merged public dispatcher is currently BlockHash-only: `FingerprintAlgorithm`,
  `FingerprintOptions`, and `ImageFingerprint` are single-member aliases, while runtime dispatch
  rejects every non-`blockhash-v1` identifier before pixel validation.
- Shared pixel normalization already enforces the approved PDQ minimum dimensions and packed
  `gray8`/`rgb8`/`rgba8` buffer contracts. Task 7 should reuse `normalizePixelSource` so malformed
  input categories and deterministic RGBA-over-white behavior stay centralized.
- Root, core, and browser entrypoints already re-export the same synchronous dispatcher. Adding
  the PDQ option/result to the core union will expose the runtime-neutral API without adding any
  Node or DOM dependency or changing the legacy callback-based `imageHash` export.
- The numeric composition order is already fully specified by the internal modules and frozen
  stage tests: normalize pixels, convert to float32 luminance, downsample to 64 by 64, compute
  quality from that shared buffer, apply the 64-to-16 DCT, then median-threshold and serialize the
  256 coefficients. No new numeric choice belongs in Task 7.
- The committed raw corpus holds 16 exact source vectors across all three accepted formats and is
  already excluded from the package artifact. A new conformance test can consume it from Node-only
  test code while keeping production core imports runtime-neutral.
- The public type seam is best represented by two correlated `fingerprintPixels` overloads:
  BlockHash accepts its legacy RGBA boundary and parameters, while PDQ requires a tagged
  `PixelSource` and only `{ algorithm: 'pdq-v1' }`. The exported union types still support generic
  storage and dispatch consumers without weakening direct-call inference.
- Existing package smoke tests already exercise the root, core, browser CommonJS/ESM entrypoints
  and scan browser bundles for Node built-ins, but only with BlockHash. Reusing the minimum 5 by 5
  gray oracle vector gives Task 7 a compact exact built-artifact check without publishing fixtures.

## PDQ Reference Hierarchy

There is no independent normative PDQ standard. The strongest practical reference set is:

1. Meta's PDQ whitepaper for algorithm intent, stages, evaluation, quality, and limitations.
2. Meta's C++ implementation for canonical numeric and serialization behavior.
3. Meta's Java implementation for a readable raw-pixel core independent of image formats.
4. Meta's regression fixtures and expected outputs for conformance.
5. `python-threatexchange` for current matching and quality threshold defaults.

The inspected Meta ThreatExchange revision was
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.

## Algorithm Facts

- PDQ emits a 256-bit perceptual hash and a quality score from 0 through 100.
- RGB luminance uses `0.299 R + 0.587 G + 0.114 B`.
- Two Jarosz-filter passes downsample luminance to 64 by 64.
- Quality is derived from horizontal and vertical gradients, scaled and capped at 100.
- A 2D DCT retains a 16 by 16 block of non-DC frequency components.
- A bit is set when the row-major DCT component is strictly greater than the Torben median.
- Internal bit `i * 16 + j` maps through reversed 16-bit words when formatted as 64 hex digits.
- Similarity is Hamming distance. Meta recommends starting with distance at most 31.
- Meta's production signal discards quality below 50.

## Conformance Implications

- Encoded-image decoders can produce platform variance. Meta's current guidance accepts exact hash
  equality for identical raw pixel arrays and distance at most 10 from C++ for decoded images with
  quality at least 80.
- The raw-pixel algorithm and the image decoder must therefore be separate tested boundaries.
- Fixture tests should cover hash, quality, bit order, alpha policy, EXIF orientation, grayscale,
  resize, and all eight dihedral transforms.
- Exact raw-pixel vectors should be the primary porting contract; decoded-image tolerance is a
  secondary integration contract.

## Pinned C++ Oracle Contract

Direct inspection of Meta ThreatExchange revision
`baefb4ed67b6cdc1d4c82dbaef858d50866ac424` establishes the following P0 requirements:

- `pdqhashing.cpp` defines `MIN_HASHABLE_DIM` as 5. The reference returns the all-zero hash and
  quality 0 when either dimension is smaller; this library should expose that condition as a typed
  invalid-input result or error rather than silently emitting a valid-looking fingerprint.
- The reference pixel adapters accept byte-valued gray or RGB channel pointers with row and column
  strides, then create a row-major float luminance buffer. The first library profile is
  intentionally narrower: tightly packed `gray8`, `rgb8`, and `rgba8`; accepted RGBA input is
  deterministically composited over white before reference-compatible RGB luminance conversion.
- RGB luminance is exactly `0.299 R + 0.587 G + 0.114 B`; gray bytes are converted directly to
  float. Numeric conformance must preserve the reference's float-oriented operation ordering.
- The algorithm returns a 256-bit hash plus an integer quality score. Quality is calculated from
  the 64 by 64 downsample, divided by 90, and capped at 100, so it is required for `pdq-v1` output.
- Hash bits are the row-major 16 by 16 DCT entries that are strictly greater than the Torben
  median. The C++ `Hash256` formatter serializes 16 reversed 16-bit words as exactly 64 lowercase
  hexadecimal characters.
- Hamming distance is the comparison primitive. Thresholds and minimum quality are policy and must
  not be embedded in the hash or distance function.

Primary paths inspected: `pdq/cpp/hashing/pdqhashing.cpp`,
`pdq/cpp/hashing/pdqhashing.h`, `pdq/cpp/common/pdqhashtypes.cpp`, and
`pdq/cpp/common/pdqhashtypes.h`.

### Task 2 Build-Seam Verification

- The prior research checkout is actually nested at
  `/tmp/image-hash-pdq-reference.aNC92H/ThreatExchange`; its verified detached HEAD is the approved
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` commit.
- The decoder-free raw interface is available directly through `fillFloatLumaFromGrey`,
  `fillFloatLumaFromRGB`, and `pdqHash256FromFloatLuma` in `pdqhashing.h`; no CImg or encoded-image
  adapter is required for the oracle wrapper.
- `Hash256::format()` is the authoritative canonical-text boundary. The wrapper should call it
  instead of duplicating the 16-bit word reversal in project tooling.
- The upstream Makefile uses C++11 and builds a much wider decoder/CLI surface. The project harness
  should compile only the hashing/common sources actually referenced by the raw wrapper, with an
  explicit include root and optimization/warning flags recorded in provenance.
- `pdqhashing.cpp` delegates Jarosz filtering and decimation to
  `pdq/cpp/downscaling/downscaling.cpp`; the minimal source set must therefore include that file in
  addition to `pdqhashing.cpp`, `torben.cpp`, `pdqhashtypes.cpp`, and `pdqhamming.cpp`.
- The verified local compiler is Apple clang 21.0.0 on arm64 macOS. The build workflow must record
  the actual compiler/version at generation time but avoid embedding machine-specific metadata in
  the deterministic fixture JSON.
- The approved RGBA normalization formula is
  `floor((channel * alpha + 255 * (255 - alpha) + 127) / 255)`. Task 3 can include RGBA source
  vectors by storing both the original synthetic bytes and the normalized RGB oracle input with
  separate SHA-256 checksums; the C++ wrapper itself should remain gray/RGB-only.

### Task 3 Corpus Observations

- The initial 16-vector self-contained corpus is 117,653 bytes. Base64 makes it larger than a
  descriptor-only fixture, but it freezes the exact raw bytes independently of generator code and
  remains small enough for offline unit tests.
- The pinned oracle returns the all-zero hash for uniform gray black, but uniform RGB white returns
  `2b2ee996c808dc13827761d552364a56300bbd29407f27f39a5536ca27a9be6e` at quality 0. The corpus
  must preserve this numeric artifact rather than assuming all flat inputs hash identically.
- The 5×257 extreme-tall RGB edge has quality 7 while the 257×5 gray edge has quality 61. Quality is
  sensitive to direction/aspect ratio and must be asserted independently from hash validity.
- The non-flat 31×29 gray/equal-channel RGB pair produced identical hash and quality 100, directly
  confirming the raw adapter equivalence expected by the contract.

### Tasks 2–3 Quality Review

Required before completion:

- The generator currently labels results with the pinned commit constant but accepts any executable
  passed through `--oracle`. Add a machine-readable oracle metadata handshake and reject a binary
  whose repository/commit/protocol do not match before generating answers.
- The C++ wrapper currently reads stdin to exhaustion before checking the expected length and has no
  memory ceiling. Read exactly the declared bytes plus an overflow sentinel, impose and document a
  bounded local-tool input limit, and validate the RGB row-stride multiplication.
- The build verification ignores untracked files in a provided checkout. Reject any checkout change,
  including untracked files, so a shadow header/source cannot silently affect the oracle.
- The generator argument reader ignores unknown and duplicate flags. Parse the complete argv list so
  a typo cannot silently write the default fixture or select an unintended binary.

## Meta Conformance, Policy, and Fixture Use

- Meta's current PDQ README explicitly separates exact raw-byte conformance from decoder
  integration conformance: exact hash equality for the same byte arrays; for independently decoded
  images, quality at least 80 and Hamming distance at most 10 from C++ is their experimental
  correctness guideline.
- Meta recommends starting product evaluation at Hamming distance at most 31 and discarding quality
  at most 49. `python-threatexchange` implements these as distance `<= 31` and usable quality
  `>= 50`. They are documented defaults, not part of `pdq-v1` computation or universal guarantees.
- ThreatExchange code is BSD-licensed, with exceptions called out per file. Its WASM README says
  included images are for open-source testing only and require separate authorization for other
  uses. Therefore the implementation may be ported with attribution/license review, but upstream
  images must not simply be copied into this package's published fixtures.
- Conformance should use locally generated raw-pixel vectors and expected hashes/quality produced
  by the pinned C++ oracle. If an upstream encoded image is ever vendored, its individual
  provenance and redistribution terms must first be recorded.

Primary paths inspected: `LICENSE`, `README.md`, `pdq/README.md`, `pdq/wasm/README.md`,
`python-threatexchange/threatexchange/signal_type/pdq/signal.py`, and
`python-threatexchange/threatexchange/signal_type/pdq/pdq_utils.py`.

## Package and Browser Standards Research

- Current Node package documentation confirms that adding an `exports` map encapsulates every
  unlisted package subpath and is likely breaking for an existing package. The new `/core`, `/node`,
  and `/browser` entrypoints are architecturally appropriate, but the release must first inventory
  historical deep imports and either map them for compatibility or treat `exports` as a major-
  version change. Keep `main` alongside `exports` for older tool compatibility.
- Explicit named subpaths are preferable to environment guessing. Node recommends `node` plus a
  `default` fallback when conditional exports are needed, but this design can avoid environment
  branches by making `/node`, `/browser`, and `/core` explicit consumer choices.
- The HTML Standard defines `ImageData` as top-to-bottom, left-to-right pixels. `rgba-unorm8` is a
  tightly packed `Uint8ClampedArray` in red, green, blue, alpha order and defaults to sRGB. This is
  a sound browser adapter for the proposed packed `rgba8` core input.
- `ImageData` and `ImageBitmap` are exposed to workers. A browser adapter can accept `Blob` and
  `ImageData`, decode a `Blob` with `createImageBitmap`, draw it to an `OffscreenCanvas` or canvas,
  and pass normalized RGBA bytes to the shared synchronous core.
- Browser decoding is not a cross-engine equality boundary. The HTML Standard leaves default color
  conversion and alpha premultiplication implementation-specific, and resize quality does not
  mandate one scaling algorithm. The adapter should request `colorSpaceConversion: "none"` and
  `premultiplyAlpha: "none"` where supported, never use browser resizing for PDQ, and still only
  promise exact results once normalized pixels are identical.
- MDN currently documents an `imageOrientation: "none"` value, while the living HTML Standard's
  enum contains only `from-image` and `flipY` and says the old `none` was renamed. Do not make
  `"none"` support a contract dependency. First-release encoded-image behavior should use the
  platform's default `from-image` orientation and document that raw pixel inputs are already
  oriented.

Primary sources: <https://nodejs.org/api/packages.html> and
<https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html>. MDN was used only to
identify the orientation-documentation discrepancy.

## Current JavaScript Library Survey

Verified on 2026-08-09 against package listings and repository manifests:

- `pdq-wasm` is the only surveyed JavaScript package implementing Meta PDQ with a Node, browser,
  and worker-facing API. npm lists 0.3.9, while the repository manifest remains 0.3.7. It accepts
  packed gray or RGB bytes, requires async WASM initialization, returns 32 hash bytes plus quality,
  and exposes Hamming helpers with a default threshold of 31. The binary asset, initialization,
  hosting/CSP concerns, version drift, and inconsistent test documentation make it a valuable
  comparator but not the production default or normative oracle.
- `imghash` 1.1.4 is an actively released Node-oriented Block Mean Value package with Promise and
  raw-pixel APIs. It demonstrates current package/API expectations but provides neither PDQ nor a
  quality score.
- `@stabilityprotocol.com/phash` 1.0.0 is a new zero-dependency TypeScript pHash for Node and
  browsers with RGBA and `ImageData` entrypoints. It is useful evidence that a small universal
  pixel core is practical, but its DCT/resizing profile is not Meta PDQ and cannot establish PDQ
  conformance.
- Other Block Mean Value and multi-hash browser libraries remain useful compatibility and decoder-
  variance references, but none supplies the desired combination of synchronous dependency-free
  TypeScript PDQ core, mandatory quality, versioned records, and pinned C++ conformance.

Conclusion: continue with an auditable TypeScript `pdq-v1` core. Use same-source Meta WASM as the
primary differential/performance comparator and pinned `pdq-wasm` as a secondary packaging/runtime
comparator. Do not introduce either as a runtime dependency during the TypeScript conformance
spike.

Sources: <https://github.com/Raudbjorn/pdq-wasm>,
<https://www.npmjs.com/package/pdq-wasm>, <https://github.com/pwlmc/imghash>, and
<https://www.npmjs.com/package/@stabilityprotocol.com/phash>.

## Capability Boundaries

- PDQ is for syntactic/copy similarity, not semantic similarity.
- It is robust to ordinary recompression, resizing, and light overlays, but it is a global
  descriptor and is not designed for deep crops.
- Eight dihedral hashes can be computed cheaply, but selecting a single lexicographic minimum is
  not guaranteed to be exactly rotation-invariant.
- Crop-resistant regional hashes or an embedding model such as SSCD are separate later candidates
  if the product requires crop or semantic robustness.
- MIH/FAISS indexing is a storage/search concern and is not required for the first hashing API.

## Implementation Candidates

- A TypeScript port from the Java/C++ raw-pixel core offers auditability and portable packaging,
  but must prove numerical conformance and performance.
- A WASM build of the Meta core offers closeness to the canonical implementation, but adds build,
  binary, memory-copy, and packaging complexity.
- A third-party package such as `pdq-wasm` can accelerate a spike, but its behavior and provenance
  must be audited against Meta fixtures before it becomes a production dependency.
- Meta's own WASM directory is a useful build/demo reference, not a polished drop-in npm package.

## Maintainer Decisions Through 2026-08-09

- The new fingerprint capability remains a separate, opt-in API in the existing package; the
  callback-based `imageHash()` contract is not extended with an algorithm option.
- The production target is an auditable TypeScript core shared by Node.js, browsers, and Web
  Workers.
- Meta C++ remains the normative algorithm oracle. A WASM build from the same pinned source is a
  differential and performance goalpost rather than an automatic runtime dependency.
- Runtime-specific loading and decoding are separate from the synchronous pixel core.
- Exact cross-runtime equality is promised for identical normalized pixels, not for independently
  decoded encoded files.
- Application-specific image detection, cropping, indexing, and search remain outside this library.
- `rgba8` uses straight alpha composited over white with the specified integer rounding rule.
- Fingerprint schema version 1, `bitLength`, canonical lowercase hex, mandatory PDQ quality, and
  explicit incompatible comparison results are approved.

## Task 4 Contract Decisions

- The reviewed implementation plan explicitly requires existing BlockHash output to remain
  identical when the caller supplies tagged `rgba8`; Task 4 therefore must support both the legacy
  untagged RGBA shape and the new tagged RGBA shape at the current dispatcher.
- Tagged PDQ pixel inputs require positive safe-integer dimensions of at least 5 by 5, exact packed
  lengths, `Uint8Array` for `gray8`/`rgb8`, and `Uint8Array` or `Uint8ClampedArray` for `rgba8`.
- Pixel validation/normalization belongs in `src/core/pixels.ts`, separate from BlockHash dispatch.
  Task 4 may establish normalized gray/RGB bytes, but luminance conversion and PDQ numeric work
  remain Task 5.
- The Linux oracle job should build the pinned source, verify the metadata/smoke protocol, regenerate
  the fixture into runner-temporary storage, and byte-compare it with the repository corpus. Merely
  adding the job is not second-environment evidence; Checkpoint B closes only after a successful run.
- The detected implementation stack is TypeScript 5.9.2, Vitest 4.1.10, Vite 8.2.1, ESLint 10.8.0,
  pnpm 11.20.0, and Node >=22.14.0. The existing CI already uses the current checkout/setup-node
  action family and Ubuntu runners, so the oracle job can reuse those repository conventions.
- `block-hash.ts` only needs the RGBA-shaped width/height/data fields. A tagged `rgba8` object can
  pass through without copying, preserving the exact legacy BlockHash path and output while tagged
  gray/RGB remain reserved for the later PDQ dispatcher.
- GitHub's official Actions documentation defines `RUNNER_TEMP` as per-job temporary storage that is
  emptied at job boundaries and recommends environment variables rather than hard-coded runner
  paths. The Linux job should therefore place the native checkout, binary, and regenerated corpus
  beneath `$RUNNER_TEMP`, keeping the workspace and package contents clean.
- The approved public draft consistently calls the discriminated union `PixelSource`; no other type
  name is already published in source. Keep the historical `RgbaImageData` name as the untagged
  compatibility type and add `PixelSource` plus its tagged member types additively.
- The local Docker daemon is available as Linux arm64, Docker 29.6.1. If one of the already-cached
  build images contains Git, a C++ compiler, and Node, it can provide independent Linux evidence
  without pushing the branch or waiting for GitHub Actions.
- The cached LLVM builder is Linux arm64 and contains Git, GNU `c++` 15.2.0/Clang tooling, and Bun,
  but not Node. The cached MTG tesstrain image has Git but neither a C++ compiler nor Node. A local
  evidence run can still build the native oracle in the LLVM image and execute the Node-compatible
  smoke/generator scripts with Bun; GitHub CI remains the authoritative Node 24 Linux run.
- The Bun Linux attempt matched source serialization through the first vector but diverged at that
  vector's oracle hash, not at the saved raw bytes. Preserve a generated file outside the disposable
  container to determine whether Bun's child-process binary stdin differs on the 5x5 case. This is
  runtime-comparator diagnosis only; it cannot replace the Node 24 CI result.
- Preserving and diffing the complete Linux output disproved the initial Bun-stdin hypothesis. Every
  source/oracle-input base64 value and SHA-256 checksum matches the repository corpus, and all
  quality scores match, but multiple native hashes differ. The varying factor is the C++ build
  environment (Debian GCC 14.2.0 versus Apple clang 21.0.0), so Checkpoint B has exposed a native
  floating-point/threshold reproducibility risk exactly as intended.
- Do not update the golden corpus to the Linux values and do not relax exact raw conformance. First
  measure the Hamming deltas and test whether explicit floating-point contraction/precision flags
  align compiler output; if not, the build plan needs a documented compiler/toolchain policy before
  TypeScript conformance can be called exact.
- Seven of 16 vectors differ under GCC, at Hamming distances 8, 26, 128, 93, 51, 18, and 93. The
  largest deltas occur on low-information/symmetric inputs where many coefficients can sit at the
  threshold; the issue is not a harmless one-bit formatting discrepancy.
- GCC's official documentation says its non-standards-mode default is `-ffp-contract=fast`, while
  Clang documents a different default contraction model and warns that fused operations can produce
  different results. `-ffp-contract=off` is therefore the first bounded compiler experiment; it is
  evidence-driven but not yet an accepted oracle flag.
- Linux GCC with `-ffp-contract=off` still diverges from the Apple-clang corpus. FMA contraction is
  therefore not the sole cause. The next bounded experiment is an unoptimized, contraction-disabled
  GCC build to separate optimization effects from unavoidable compiler/platform float differences.
- Linux GCC at effective `-O0 -ffp-contract=off` also diverges. This rules out the tested optimizer
  and contraction settings as a complete remedy and points to compiler/platform evaluation details
  or threshold instability in the reference algorithm itself. Avoid further flag guessing without
  revisiting the checkpoint's exact acceptance wording and Meta's conformance boundary.
- Checkpoint B's written criterion says the oracle must be reproducible on two clean environments;
  Task 3 separately requires fixture regeneration to produce no diff. A second environment that
  merely compiles but produces different golden answers does not satisfy their combined intent.
- GitHub's official Ubuntu 24.04 runner manifest currently includes Clang 16, 17, and 18 plus GCC
  12, 13, and 14. Pinning `ubuntu-24.04` and an explicit compiler is more reproducible than relying
  on the moving `ubuntu-latest` default, but Linux Clang output must be measured before selecting it.
- A clean Debian Linux arm64 build with Clang 19.1.7 regenerated all 16 vectors byte-for-byte equal
  to the Apple-clang-21 corpus. This establishes that the corpus is reproducible across two OSes and
  two Clang releases, while the recorded GCC mismatch remains a toolchain limitation.
- The recurring GitHub job should pin `ubuntu-24.04` and `clang++-18`, both explicitly listed in the
  official runner manifest, rather than use default `c++`. The job itself will prove whether Clang
  18 on Linux x64 also agrees; until its first run, that particular CI environment is configured but
  not yet observed.
- Task 4 changes the published `fingerprintPixels` input type, so README contract text must explain
  both legacy untagged RGBA and tagged `rgba8` BlockHash inputs. Tagged gray/RGB are accepted by the
  frozen pixel contract for the forthcoming PDQ dispatcher, but must not be advertised as callable
  BlockHash inputs.
- `NormalizedPixelSource` is an internal algorithm seam, not part of the approved public API. Keep
  it available to `pixels.ts` without re-exporting it from root, browser, or `/core`.

### Task 4 Quality Review

- Required compatibility fix: checking only for the presence of a `format` property reinterprets
  previously valid RGBA-shaped objects with unrelated metadata as tagged inputs. BlockHash must
  recognize only the three reserved tag values; unknown metadata must retain the historical
  width/height/data validation path.
- Required CI fix: the release `deploy` job currently depends only on general verification and
  package integrity. Add `pdq-oracle-conformance` to `needs` so a failing oracle/corpus check cannot
  coexist with a package publish on a main-branch push.
- Coverage improvement: assert overlong as well as truncated packed data so “exact length” cannot
  regress into a minimum-length check.
- All required review items are resolved. The rebuilt root/browser/core declarations expose only
  the approved tagged input types; the normalized-output alias remains private to the internal
  `pixels` declaration. Legacy extra metadata now follows the legacy validator, reserved PDQ tags
  remain explicit, and the release job depends on oracle conformance.

## Task 5 Numeric Scope

- Task 5 is limited to gray/RGB luminance, two-pass Jarosz filtering/decimation to 64 by 64, and
  quality. DCT, Torben median, hash-bit serialization, and public dispatch remain Task 6 or later.
- Acceptance requires stage-level diagnostic answers, not only final hash/quality fixtures. The
  existing oracle protocol exposes final hash and quality only, so the pinned C++ stage seams must
  be inspected before choosing whether to add a local diagnostic mode or derive smaller direct
  stage fixtures another way.
- No trusted temporary ThreatExchange checkout is currently present under `/tmp`; source inspection
  must use the exact pinned GitHub revision or a new commit-verified disposable checkout.
- Web search did not surface the pinned implementation files, and direct `raw.githubusercontent.com`
  opens returned cache-miss errors. Do not infer operation order from the repository overview; use
  the already approved build script to create a fresh verified checkout for exact source inspection.

### Pinned reference operation order

- Meta commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424` converts RGB with float constants
  `0.299`, `0.587`, and `0.114` in R-then-G-then-B expression order; gray bytes cast directly
  to float.
- Except for an exact 64 by 64 input fast path, PDQ computes each Jarosz window as
  `ceil(oldDimension / 128)`, runs two row/column box-filter pairs, then decimates to 64 by 64.
- Quality traverses all 63-by-64 vertical and 64-by-63 horizontal neighbors. Each difference is
  scaled by 100/255 and truncated to an integer before its absolute value is accumulated; the sum
  is integer-divided by 90 and capped at 100.
- Decimation samples pixel centers with `trunc(((outputIndex + 0.5) * inputSize) / 64)` independently
  on each axis. Row filters process contiguous rows; column filters apply the same one-dimensional
  routine with a row-stride step.
- The one-dimensional filter uses four explicit edge phases and a float running sum. Faithful
  TypeScript therefore needs `Float32Array` storage plus `Math.fround` on every C++ float add,
  subtract, and divide; a generic prefix-sum rewrite would change rounding order.
- The existing repository oracle wrapper already owns both the input-to-luma step and the 64 by 64
  buffer. Extending it with a diagnostics flag is the smallest authoritative way to freeze luma and
  downsample stage values without exposing native code at package runtime.
- Keep the existing schema-1 raw corpus unchanged. A separate compact stage corpus can store all
  64-by-64 float bit patterns for one deterministic two-axis filtered gray vector, while a small RGB
  vector freezes coefficient behavior; this gives exact diagnostics without mixing intermediate
  implementation data into the end-to-end fixture contract.
- Apple Clang 21 at the oracle's approved `-O3` flags emits RGB luminance as a rounded green
  multiplication followed by `fma(red, 0.299f, greenProduct)` and then
  `fma(blue, 0.114f, prior)`. The initial all-separate float32 TypeScript expression missed one
  small-vector value by one ULP; assembly inspection localized this to contraction, not Jarosz.

### Task 5 quality-review findings

- The first implementation kept the caller's full luma array immutable by cloning it before the
  second work buffer. This would retain three full-resolution float arrays during hashing; the C++
  pipeline mutates its first buffer and needs only two. Because this is an internal stage contract,
  explicitly consuming/mutating the luma work buffer avoids one image-sized allocation.
- The oracle wrapper copied the entire luma buffer even in normal hash-only mode after diagnostics
  were added. Restrict that copy to diagnostics so the established oracle path keeps its prior
  memory profile.
- The fused multiply-add emulation is non-obvious and should document why a JavaScript double
  expression followed by one `Math.fround` is intentional.
- Focused negative tests should cover invalid stage dimensions, luma length, and 64-by-64 quality
  length rather than leaving those internal guard branches unverified.
- Final documentation review found the modernization index still describing the cross-runtime
  foundation as in progress and claiming no PDQ numeric code existed. Update it to distinguish the
  completed internal first-half stages from the still-gated DCT, serialization, and public dispatch.

## Task 6 Numeric Scope

- Task 6 is limited to the pinned 64-to-16 DCT, Torben median, strict greater-than thresholding,
  256 bit positions, and canonical 64-character lowercase hexadecimal output. Public fingerprint
  dispatch and records remain Task 7.
- The disposable Meta checkout used for Task 5 is still present and verifies at the exact pinned
  commit `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`; it is suitable for read-only source inspection.
- Authoritative seams are `dct64To16` and `pdqBuffer16x16ToBits` in `pdqhashing.cpp`, `torben.cpp`,
  `Hash256::setBit` in `pdqhashtypes.h`, and `Hash256::format` in `pdqhashtypes.cpp`.
- The DCT coefficient matrix is 16 by 64 and represents frequency slots 1 through 16, deliberately
  excluding DC. Its float scale is `sqrt(2/64)`; each coefficient is the float assignment of that
  scale times a double-precision cosine.
- The transform is explicitly two matrix passes: `T = D * A` for 16 by 64, then `B = T * D^T` for
  16 by 16. Each 64-term accumulation is written as float `sum += product` in increasing `k` order.
- Torben median scans without sorting, using float min/max/guess values and counts. For 256 values,
  its comparisons use `(n + 1) / 2 == 128`; ties can therefore return an existing value or the
  rounded midpoint guess depending on the count path.
- Bit index `i * 16 + j` sets bit `j` of internal 16-bit word `i`. Canonical formatting prints
  words 15 down to 0, each as four lowercase hex digits; threshold equality leaves a bit clear.
- The optimized native ARM64 oracle contracts scalar multiply/add operations into `fmadd`/`fmla`,
  while the pinned Java and PHP ports express the same increasing-index scalar sequence. Exact
  intermediate diagnostics should therefore use a non-contracted C++ build that preserves the
  source operation boundaries available to JavaScript and baseline WebAssembly; the final hash
  must also agree with the normally optimized reference binary.
- The pinned Java implementation independently confirms the 16-by-64 DCT matrix formula, float
  coefficient storage, two-pass transform, Torben median, and strict thresholding seams.
- The existing oracle build deliberately pins Clang `-O3` and documents that its saved corpus is
  byte-identical across Apple Clang 21 and Debian Clang 19 on arm64; changing the global oracle
  flags would alter an already accepted Task 4 contract. Task 6 should extend the diagnostic
  protocol without weakening that build provenance, then use explicit JavaScript float32 rounding
  and compare canonical hashes to the normal oracle output.
- The first Task 6 lint run localized six style failures without any typecheck failure: ESLint
  rejects the C++ source's over-precise decimal pi literal, and detects five median loop-state
  initializers that are overwritten before their first read. `Math.PI` is the same IEEE-754 binary64
  value as the pinned C++ literal; declaring the loop-carried result tuple inside the loop removes
  the redundant assignments without changing Torben's decisions.
- Multi-axis review found no correctness, security, architecture, or performance blocker. The
  implementation is bounded to 81,920 DCT multiply/adds per normalized image plus small fixed-size
  median/hash work; it adds no dependency, I/O, or public dispatch and preserves legacy behavior.
- `Math.cos` is used only once at module initialization and every coefficient is immediately rounded
  to float32. The exact Node 22/24 and pinned-oracle results agree; actual Chromium/Firefox/WebKit
  agreement remains a deliberate Task 11 gate before the browser exactness promise is released.
- Package dry-run confirms fixtures, generator/oracle tooling, planning files, and third-party source
  stay out of the tarball. TypeScript-emitted internal PDQ modules are present under `lib`, as they
  already were after Task 5, but are not package-export entrypoints until Task 7 composes the public
  API.

## Portable Numeric Profile

- GitHub run `31322184314` proved the Node 22/24 TypeScript implementation matches the committed
  arm64-derived corpus on Ubuntu x64; only native C++ corpus regeneration failed. Production
  portability and native-oracle reproducibility are therefore separate concerns.
- The previous branch run at `6e3ccbd` failed the same Linux x64 oracle job, proving Task 6 did not
  introduce the architecture split.
- An x86_64 Apple-Clang build reproduced broad native hash differences with unchanged raw bytes and
  quality. Pinning compiler family alone is insufficient; canonical native regeneration must also
  pin architecture.
- GitHub's official runner reference lists `ubuntu-24.04-arm` for arm64 Linux runners. It is in
  public preview, so the CI contract must name the architecture explicitly and retain local/frozen
  corpus evidence rather than treating the moving image as the algorithm definition.
- ECMAScript specifies `Math.fround` as IEEE-754 binary32 round-to-nearest, ties-to-even, but
  `Math.cos` is implementation-approximated. Freezing the 1,024 DCT coefficient bit patterns removes
  the remaining transcendental cross-engine dependency from the TypeScript core.
- WebAssembly scalar float operations are specified over IEEE floating-point values; same-source
  WASM is the relevant portability differential. It must not silently become a runtime backend or
  redefine `pdq-v1` until its exact answers are compared with the accepted corpus.

## Cross-Runtime Foundation Baseline

The cross-runtime foundation landed on `main` as `2686eac` and is included in the synchronized
`d4f88fa` planning baseline. It:

- introduces a tightly packed RGBA pixel boundary and a typed `blockhash-v1` result
- exposes a synchronous `fingerprintPixels()` function from root, `/core`, and `/browser`
- adds `/node`, `/browser`, and `/core` package exports
- adds a browser ESM build and package smoke test
- adds focused raw-pixel validation tests
- updates the README and cross-runtime package ADR for browser support

This foundation proves the package boundary but does not resolve the PDQ contract. Its result shape
already uses schema version 1, `bitLength`, canonical hex encoding, and explicit
BlockHash parameters. The PDQ work should extend that discriminated contract with mandatory quality
rather than replace it. The current pixel boundary remains RGBA-only and must be generalized to the
approved tagged `gray8`/`rgb8`/`rgba8` union. Its `exports` map preserves root, `lib`, and
`package.json` compatibility paths; packed-consumer verification is part of the passing baseline
and remains a regression gate for PDQ.

Current implementation seams relevant to task planning:

- `src/core/types.ts`: public pixel, algorithm, option, and result contracts
- `src/core/fingerprint.ts`: validation and algorithm dispatch, currently coupled to RGBA BlockHash
- `src/core/index.ts`: runtime-neutral public surface
- `src/browser.ts`: browser-safe re-export surface
- `src/index.ts`: legacy Node callback API plus new core re-exports
- `__tests__/core.test.ts`: current portable raw-pixel contract tests
- `scripts/package-smoke.cjs` and `scripts/browser-package-smoke.mjs`: packed entrypoint checks

The current gate and packaging baseline already provide:

- Vitest node-environment coverage gates over `src/**/*.ts`
- Node 22 and 24 CI verification
- a separate Node 24 packed-artifact integrity job
- browser ESM bundling through `vite.lib.config.mts`
- CommonJS root/core/browser/package deep-import smoke coverage and a browser graph scan for Node
  built-ins

Actual browser-engine execution is not yet part of CI. PDQ's exact Node/browser/worker promise will
require a real browser harness rather than treating Node's ability to import the browser ESM artifact
as browser conformance.

## 2026-08-09 Upstream State

- Fresh `origin/main` is `d4f88fa06c09dff42c4684369db12bb574ebd13e`.
- Its only change since the feature branch base is a Dependabot lockfile update for `file-type`
  (`21.1.0` to `21.3.2`).
- Cross-runtime groundwork landed on `origin/main` as `2686eac`; the local feature commit
  `e04939e` is patch-equivalent but has a different commit identity. Fresh-main planning should use
  `d4f88fa` as its base, which adds only the later `file-type` lockfile update.
- The synchronized planning branch is `codex/pdq-build-plan`, based directly on `d4f88fa`.
- `pnpm test:package` imports the packed browser ESM from Node and scans emitted `.mjs` files for
  forbidden Node imports. `scripts/browser-smoke.html` is a browser-ready fixture, but no script or
  CI job currently opens it.
- There is no Playwright, Web Test Runner, browser binary, or worker conformance harness in the
  fresh-main package dependencies and CI. Task 11 remains necessary for real Chromium, Firefox,
  WebKit, and worker evidence.
- The landed portable boundary is still RGBA-only and BlockHash-only. Its schema-versioned result
  already establishes `bitLength`, canonical hex, algorithm parameters, and explicit subpath
  exports that PDQ should extend.
- Local verification required a supported fnm-selected Node runtime and `CI=true` because the
  non-TTY pnpm 11 process attempted dependency-status reconciliation before running scripts. The
  project itself passed the complete `pnpm run check` gate once the refreshed frozen-lockfile
  dependencies were installed; this was environment recovery, not a product-code defect.

## Research Report Review

A separate ChatGPT report supported the central architecture and surfaced useful contract details:

- `pdq-v1` must version the complete normalized-pixel-to-fingerprint behavior
- the returned record may need its own schema version
- mathematical comparison should be distinct from match/quality policy
- incompatible fingerprints should be distinguishable from valid non-matches
- package subpaths should be explicit rather than selected through runtime guessing
- pure TypeScript numeric behavior must be differentially tested against C++ float behavior

The report is not an authoritative source. At least one npm citation was malformed, and claims about
package versions, browser standards, minimum dimensions, and fixture licensing require direct
primary-source verification before entering contract documentation.

## AI Central Integration

- Link mode is used so repo-specific policy is reviewable while shared skills stay centralized.
- Profiles: `base`, `javascript-typescript`.
- Bundles: `core`, `planning`, `workflow`.
- Reviewed AI Central revision: `0248f5b22ec1b5e53b0c5c3be39d150932e0821d`.

## 2026-08-09 CI Portability Checkpoint

- The CI repair uses GitHub's explicit `ubuntu-24.04-arm` runner label, renames the check so its
  architecture is visible, and compares both `raw-vectors.json` and `stage-vectors.json`. The
  ordinary x64 Node jobs remain the cross-platform check for the TypeScript implementation.
- The current TypeScript DCT constructs all 1,024 coefficients at module initialization with
  `Math.cos`; all subsequent arithmetic is explicitly rounded through `Math.fround`. Freezing the
  matrix can therefore be isolated to a constant module without changing the DCT loop structure.
- An exact 64-by-64 identity luminance input makes the native oracle's first DCT pass equal the
  16-by-64 coefficient matrix: each row/column accumulation contains one multiplication by one and
  otherwise zero terms. This provides an oracle-derived coefficient fixture without duplicating
  Meta's matrix formula in the wrapper.
- The frozen matrix will use a generated hexadecimal uint32-bit payload decoded with `DataView`,
  keeping the bit contract explicit and endian-independent without Node APIs or a runtime
  dependency. A checked-in generator will derive that module only from the self-checking identity
  fixture, and the DCT module will retain a single decoded `Float32Array` instance.
- The pinned upstream `pdq/wasm` project is an encoded-file browser demo built with Emscripten
  3.1.7, ImageMagick, Node hosting, Selenium, and .NET tests. It is not a suitable differential for
  the decoder-free pixel contract and would conflate codec behavior with numeric behavior.
- Local Emscripten tools are absent but Docker is installed. The appropriate same-source experiment
  is a disposable, decoder-free Emscripten build of the existing raw oracle wrapper and the exact
  pinned C++ translation units, with the frozen raw bytes supplied from JavaScript. No generated
  WASM or Emscripten glue should enter the npm package.
- A native Apple Clang 21 arm64 build with only `-ffp-contract=off` produces raw and stage corpora
  byte-for-byte identical to Emscripten 3.1.7 WASM. Their SHA-256 values are respectively
  `14aaeec3f68da5ca98a1e76915af746e164e6771ae9f566b68bcf537bd78552f` and
  `0ad88a5ef3c38e7b75919634989d286136a1ea93b6f7403cffcb0af3c618a9d5`. This proves floating-point
  contraction is the complete cause of the observed WASM split on this corpus; coefficient bits,
  decoder behavior, and architecture are excluded.
- Because `pdq-v1` is not public yet, the portable unfused profile is the safer persisted contract:
  it is source-faithful, naturally reproducible in WebAssembly, byte-identical in native Clang with
  one explicit flag, and expressible in JavaScript as a float32-rounded multiply followed by a
  separately float32-rounded add. Retaining the fused arm64 profile would be deterministic in pure
  TypeScript but would require software FMA semantics in any future WASM backend and preserve an
  avoidable architecture-specific oracle assumption.
- The downloaded Emscripten 3.1.7 toolchain resolves to immutable image digest
  `sha256:6143f5b3d58fe6e7faf9f279d27ea9ea975983ee2b5490478abda126a6762f34`.
  The checked-in development build script should use this digest, not only the mutable tag.
- Apple Clang 21 with `-ffp-contract=off` regenerates the accepted raw and stage corpora exactly for
  both arm64 and x86_64 targets. Disabling contraction therefore removes the original x64 split on
  the fixed corpus; production TypeScript additionally removes runtime coefficient generation.

## 2026-08-09 Task 8 Codec Contract

- The approved schema-v1 record is an object/JSON envelope. Task 8 will expose
  `parseFingerprint(serialized: string): ImageFingerprint` and
  `serializeFingerprint(fingerprint: ImageFingerprint): string` as the smallest explicit
  round-trip API.
- Parsing is strict: JSON must decode to exactly one supported record shape, with no unknown
  top-level fields and no unknown BlockHash parameter fields. Serialization repeats runtime
  validation so untyped JavaScript callers cannot emit invalid persisted records.
- Canonical JSON is produced by reconstructing records in schema order before `JSON.stringify`.
  Accepted uppercase hexadecimal is normalized to lowercase in both parsed records and serialized
  output.
- `pdq-v1` requires schema version 1, `hex`, exactly 64 hexadecimal characters, bit length 256,
  and integer quality from 0 through 100.
- `blockhash-v1` requires a positive even safe-integer `bitsPerSide`, method 1 or 2, bit length
  exactly equal to `bitsPerSide ** 2`, and a hexadecimal hash whose length is `bitLength / 4`.
  This mirrors the legacy nibble serialization and the existing portable dispatcher contract.
- Codec exports belong to `/core` and are re-exported from the browser and root/Node surfaces; the
  implementation remains decoder-free and runtime-neutral.
- Existing packed-package smoke tests already exercise root, `/core`, browser CommonJS, and browser
  ESM surfaces. Task 8 extends those same checks with codec round trips so declaration/build/export
  drift is caught without adding a new harness.

## 2026-08-09 Task 9 Comparison Contract

- `compareFingerprints(left, right)` is mathematical only. Comparable results contain algorithm,
  Hamming distance, bit length, and `distance / bitLength`; incompatible results use exactly
  `algorithm-mismatch`, `parameter-mismatch`, or `bit-length-mismatch`.
- Compatibility checks are ordered by algorithm, BlockHash parameters, then bit length. This makes
  different BlockHash configurations explicitly incompatible rather than treating them as valid
  non-matches.
- Comparison does not apply quality or a distance threshold. Hamming is computed over validated
  equal-length hexadecimal strings and remains bounded by the declared bit length.
- Task 9 will export `PDQ_STARTING_POLICY` as `{ maxDistance: 31, minQuality: 50 }`, but no function
  uses it implicitly.
- The explicit policy API will be
  `evaluatePdqMatch(left: PdqFingerprint, right: PdqFingerprint, policy: PdqMatchPolicy)`.
  Its result retains the unchanged comparable PDQ distance and distinguishes an ineligible
  `quality-below-minimum` result from an eligible distance match/non-match.
- Policy fields are runtime validated as integers: `maxDistance` from 0 through 256 and
  `minQuality` from 0 through 100.
