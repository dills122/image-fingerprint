# Testing And Quality Gates

Testing protects serialized fingerprint compatibility, matching behavior, public contracts, and
untrusted image-input boundaries.

## Default Expectations

- Add or update focused tests for every behavior change.
- Keep the existing golden Block Mean Value hashes unchanged unless an approved migration says
  otherwise.
- Test algorithm work with labeled positive transformations and unrelated negative images.
- Record Hamming/vector thresholds from representative measurements, not intuition.
- Cover malformed, unsupported, oversized, truncated, and decoder-failure inputs.
- Keep unit tests deterministic; live remote URLs belong only in explicit integration tests.
- Keep benchmark fixtures small enough for the repository and record license/provenance metadata.

## Before Finishing Work

Run the smallest reliable command that validates the changed area, then the full relevant gate:

- Lint: `pnpm lint`
- Unit tests: `pnpm test`
- Typecheck: `pnpm typecheck`
- Build/package smoke: `pnpm test:package`
- Full local gate: `pnpm check`
- AI Central integration: `pnpm codex:links`

If dependencies cannot be installed or a command cannot run locally, document why and what risk
remains.

## Quality Gates

- No known failing tests introduced by the change.
- No unrelated formatting or generated-output churn.
- Public types, declarations, README examples, and runtime exports remain aligned.
- Serialized formats carry an algorithm/version identifier in any new API.
- Benchmark claims link to reproducible fixtures, transforms, metrics, and commands.
- Docs are updated for setup, command, contract, threshold, or workflow changes.
