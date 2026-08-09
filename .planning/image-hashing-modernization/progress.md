# Image Hashing Modernization Progress

## 2026-08-07

- Audited the current package structure, callback API, decoders, BMVB implementation, and golden
  tests.
- Integrated the sibling AI Central repository in link mode with project-owned guidance.
- Added a reproducible AI Central setup wrapper and provenance pin.
- Reviewed the planning-files, source-driven, and spec-driven workflow guidance installed by AI
  Central.
- Reviewed Meta's PDQ whitepaper as text and rendered pages.
- Inspected Meta's current PDQ README, C++ and Java core implementations, hash serialization,
  regression material, MIH notes, and `python-threatexchange` thresholds.
- Pinned source inspection to ThreatExchange commit
  `baefb4ed67b6cdc1d4c82dbaef858d50866ac424`.
- Drafted reference, benchmark, and modernization specification documents.
- Verified shell syntax, JSON syntax, Markdown-local links, the AI Central revision pin, and the
  absence of broken Codex symlinks.
- Ran the AI Central wrapper twice and confirmed that refresh is idempotent.
- Did not run package lint/build/tests because dependencies are not installed. The login shell is
  also on Node 16 while the repository's dependency graph requires a modern Node runtime; selecting
  and declaring the supported runtime remains an explicit specification decision.

## Current Gate

The specification is ready for maintainer review. Algorithm implementation and dependency choice
remain intentionally pending.

## 2026-08-07 — Tooling Prerequisite

- Added proposed ADR 0001 for versioned algorithm expansion.
- Completed the supported Node/pnpm/TypeScript/ESLint/Vitest/CI baseline before PDQ implementation.
- Preserved existing local BMVB golden hashes through strict typing and package-boundary changes.
