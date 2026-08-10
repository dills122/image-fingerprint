# Changelog

All notable changes to `image-fingerprint` are documented here.

## 0.1.0 - Unreleased

Release candidates:

- `0.1.0-rc.0` claimed the npm package under the `next` tag through a one-time manual publish.
- `0.1.0-rc.1` validated GitHub Actions trusted publishing and npm provenance.

- Initial public release.
- Add versioned `blockhash-v1` and `pdq-v1` fingerprints.
- Add exact `image-hash@7` decoder compatibility through an explicit Node-only mode.
- Add strict serialization, parsing, comparison, and explicit PDQ policy helpers.
- Add Node.js and browser encoded-image adapters with bounded decoding.
- Add CommonJS, ESM, TypeScript, browser, worker, ARM64 oracle, package-integrity, and CodeQL gates.
- Start a new package and version line without the legacy callback, remote-request, or historical
  `lib/*` deep-import surface.

See [the complete 0.1.0 release notes](./docs/modernization/release-notes-0.1.0.md).
