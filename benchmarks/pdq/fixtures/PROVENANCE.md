# PDQ adapter-tolerance fixture provenance

Every encoded image in `images/` is generated from mathematical pixel patterns by
`../generate-adapter-fixtures.mjs`. No third-party image or artwork is included.

The generated fixture images are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generator source remains
covered by the repository's MIT license.

`manifest.json` records the generator checksum, pinned Sharp version, libvips version, encoded-file
checksums, dimensions, formats, color/metadata categories, and per-fixture provenance. Regenerate
the corpus with:

```sh
pnpm pdq:adapter:fixtures:generate
```

Encoded bytes are committed so browser and platform comparisons always consume the same files.
The generator is provenance tooling; changes in native encoder dependencies may produce different
bytes and must be reviewed as an intentional corpus revision.
