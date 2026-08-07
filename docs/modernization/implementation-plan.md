# Image Hashing Modernization Implementation Plan

Status: scaffold only — blocked pending specification approval
Updated: 2026-08-07

This document intentionally contains phase gates rather than implementation tasks. Detailed design
and task breakdown begin only after a maintainer approves
`image-hashing-modernization-spec.md`.

## Phase A: Contract Lock

- Freeze legacy API, error, and golden-hash behavior.
- Establish supported runtime/module targets.
- Establish fixture provenance and benchmark acceptance criteria.

Exit: compatibility contract and benchmark corpus approved.

## Phase B: Candidate Spike

- Compare an auditable TypeScript port, Meta-derived WASM, and credible third-party runtime on the
  same raw-pixel vectors.
- Produce conformance, performance, package, maintenance, and licensing evidence.

Exit: implementation approach approved; rejected options and reasons recorded.

## Phase C: Architecture and Migration

- Finalize public types, algorithm registry, decoder contract, and matching helpers.
- Define callback compatibility, Promise behavior, module packaging, and stored-hash migration.
- Define whether/when PDQ can become a default.

Exit: API and migration design approved.

## Phase D: Implementation and Verification

- Implement approved boundaries in small reviewable changes.
- Run exact raw-pixel conformance, decoder integration, transformations, compatibility, and
  performance suites.
- Document any platform tolerance and known limitations.

Exit: all specification success criteria met with recorded command output.

## Phase E: Release

- Publish algorithm/version and threshold documentation.
- Ship opt-in/dual-write support before any default change.
- Monitor downstream feedback and benchmark regressions.

Exit: release and rollback/migration guidance available to consumers.
