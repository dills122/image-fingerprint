import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PINNED_SHARP_VERSION = '0.35.3';
const DEFAULT_OUTPUT_DIRECTORY = fileURLToPath(
  new URL('./fixtures/', import.meta.url),
);

const parseArguments = (arguments_) => {
  if (arguments_.length === 0) return DEFAULT_OUTPUT_DIRECTORY;
  if (arguments_.length === 2 && arguments_[0] === '--output-directory') {
    return resolve(arguments_[1]);
  }
  throw new Error(
    'Usage: node benchmarks/pdq/generate-adapter-fixtures.mjs [--output-directory <directory>]',
  );
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const rgba = (width, height, pixel) => {
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y);
      const offset = (y * width + x) * 4;
      bytes[offset] = values[0];
      bytes[offset + 1] = values[1];
      bytes[offset + 2] = values[2];
      bytes[offset + 3] = values[3];
    }
  }
  return bytes;
};

const sceneWidth = 144;
const sceneHeight = 192;
const opaqueScene = rgba(sceneWidth, sceneHeight, (x, y) => {
  const frame = x < 8 || y < 8 || x >= sceneWidth - 8 || y >= sceneHeight - 8;
  const center = x > 34 && x < 110 && y > 48 && y < 142;
  const stripe = (Math.floor(x / 9) + Math.floor(y / 11)) % 2 === 0;
  if (frame) return [24, 18, 46, 255];
  if (center) {
    return stripe
      ? [(x * 7 + y * 3) & 0xff, (x * 2 + y * 5) & 0xff, 214, 255]
      : [230, (x * 5 + y * 7) & 0xff, (x * 3 + y * 2) & 0xff, 255];
  }
  return [
    (x * 11 + y * 5) & 0xff,
    (x * 3 + y * 13) & 0xff,
    (x * 17 + y * 7) & 0xff,
    255,
  ];
});

const alphaScene = rgba(sceneWidth, sceneHeight, (x, y) => {
  const ring = Math.abs(x - sceneWidth / 2) + Math.abs(y - sceneHeight / 2);
  return [
    (x * 13 + y * 3) & 0xff,
    (x * 5 + y * 11) & 0xff,
    (x * 7 + y * 17) & 0xff,
    ring < 42 ? 255 : (x * 9 + y * 7) & 0xff,
  ];
});

const rawPipeline = (bytes) => sharp(bytes, {
  raw: { width: sceneWidth, height: sceneHeight, channels: 4 },
});

const specifications = [
  {
    id: 'opaque-srgb-png',
    file: 'images/opaque-srgb.png',
    format: 'png',
    mediaType: 'image/png',
    categories: ['format:png', 'icc:srgb', 'opaque', 'lossless'],
    encode: () => rawPipeline(opaqueScene)
      .withIccProfile('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer(),
  },
  {
    id: 'opaque-srgb-jpeg',
    file: 'images/opaque-srgb.jpg',
    format: 'jpeg',
    mediaType: 'image/jpeg',
    categories: ['format:jpeg', 'icc:srgb', 'opaque', 'lossy'],
    encode: () => rawPipeline(opaqueScene)
      .removeAlpha()
      .withIccProfile('srgb')
      .jpeg({ quality: 90, chromaSubsampling: '4:2:0' })
      .toBuffer(),
  },
  {
    id: 'opaque-srgb-webp',
    file: 'images/opaque-srgb.webp',
    format: 'webp',
    mediaType: 'image/webp',
    categories: ['format:webp', 'icc:srgb', 'opaque', 'lossy'],
    encode: () => rawPipeline(opaqueScene)
      .removeAlpha()
      .withIccProfile('srgb')
      .webp({ quality: 90 })
      .toBuffer(),
  },
  {
    id: 'grayscale-srgb-png',
    file: 'images/grayscale-srgb.png',
    format: 'png',
    mediaType: 'image/png',
    categories: ['format:png', 'icc:srgb', 'grayscale', 'lossless'],
    encode: () => rawPipeline(opaqueScene)
      .greyscale()
      .withIccProfile('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer(),
  },
  {
    id: 'alpha-srgb-png',
    file: 'images/alpha-srgb.png',
    format: 'png',
    mediaType: 'image/png',
    categories: ['format:png', 'icc:srgb', 'alpha', 'lossless'],
    encode: () => rawPipeline(alphaScene)
      .withIccProfile('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer(),
  },
  {
    id: 'alpha-srgb-webp',
    file: 'images/alpha-srgb.webp',
    format: 'webp',
    mediaType: 'image/webp',
    categories: ['format:webp', 'icc:srgb', 'alpha', 'lossy'],
    encode: () => rawPipeline(alphaScene)
      .withIccProfile('srgb')
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer(),
  },
  {
    id: 'orientation-6-srgb-jpeg',
    file: 'images/orientation-6-srgb.jpg',
    format: 'jpeg',
    mediaType: 'image/jpeg',
    categories: ['format:jpeg', 'icc:srgb', 'exif-orientation', 'lossy'],
    expectedWidth: sceneHeight,
    expectedHeight: sceneWidth,
    encode: () => rawPipeline(opaqueScene)
      .removeAlpha()
      .withMetadata({ orientation: 6 })
      .withIccProfile('srgb')
      .jpeg({ quality: 90, chromaSubsampling: '4:2:0' })
      .toBuffer(),
  },
  {
    id: 'opaque-p3-png',
    file: 'images/opaque-p3.png',
    format: 'png',
    mediaType: 'image/png',
    categories: ['format:png', 'icc:p3', 'opaque', 'lossless'],
    encode: () => rawPipeline(opaqueScene)
      .withIccProfile('p3')
      .png({ compressionLevel: 9 })
      .toBuffer(),
  },
];

const run = async () => {
  if (sharp.versions.sharp !== PINNED_SHARP_VERSION) {
    throw new Error(
      `Fixture generation requires sharp ${PINNED_SHARP_VERSION}; received ${sharp.versions.sharp}`,
    );
  }

  const outputDirectory = parseArguments(process.argv.slice(2));
  const imagesDirectory = join(outputDirectory, 'images');
  await mkdir(imagesDirectory, { recursive: true });
  const generatorBytes = await readFile(fileURLToPath(import.meta.url));
  const fixtures = [];

  for (const specification of specifications) {
    const encoded = await specification.encode();
    const output = join(outputDirectory, specification.file);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, encoded);
    fixtures.push({
      id: specification.id,
      file: specification.file,
      sha256: sha256(encoded),
      byteLength: encoded.byteLength,
      format: specification.format,
      mediaType: specification.mediaType,
      expectedWidth: specification.expectedWidth ?? sceneWidth,
      expectedHeight: specification.expectedHeight ?? sceneHeight,
      categories: specification.categories,
      provenance: {
        kind: 'generated',
        recipe: basename(fileURLToPath(import.meta.url)),
        sourceLicense: 'CC0-1.0',
      },
    });
  }

  const manifest = {
    schemaVersion: 1,
    corpus: 'pdq-adapter-tolerance-v1',
    description: 'Deterministic synthetic encoded-image corpus for decoder tolerance measurement.',
    generator: {
      file: basename(fileURLToPath(import.meta.url)),
      sha256: sha256(generatorBytes),
      sharp: PINNED_SHARP_VERSION,
      libvips: sharp.versions.vips,
    },
    documentedExceptions: [{
      fixture: 'opaque-p3-png',
      runtime: 'browser',
      engine: 'firefox',
      maximumDistance: 12,
      category: 'icc-color-management',
      rationale: 'Firefox Display P3 conversion differs from the pinned Sharp sRGB reference; see docs/modernization/pdq-adapter-conformance.md.',
    }],
    fixtures,
  };
  await writeFile(
    join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
};

try {
  await run();
} catch (error) {
  process.stderr.write(`generate-adapter-fixtures: ${error.message}\n`);
  process.exitCode = 2;
}
