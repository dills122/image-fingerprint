import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const REFERENCE_REPOSITORY = 'https://github.com/facebook/ThreatExchange.git';
const REFERENCE_COMMIT = 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424';
const DEFAULT_OUTPUT = resolve('__tests__/fixtures/pdq/raw-vectors.json');

const parseArguments = (arguments_) => {
  const allowed = new Set(['--oracle', '--output']);
  const parsed = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') {
      continue;
    }
    if (!allowed.has(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (parsed.has(argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    if (index + 1 >= arguments_.length || arguments_[index + 1].startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    parsed.set(argument, arguments_[index + 1]);
    index += 1;
  }
  return parsed;
};

const arguments_ = parseArguments(process.argv.slice(2));
const oracle = arguments_.get('--oracle');
if (oracle === undefined) {
  throw new Error(
    'Usage: node scripts/generate-pdq-fixtures.mjs --oracle <binary> [--output <json>]',
  );
}
const output = resolve(arguments_.get('--output') ?? DEFAULT_OUTPUT);

const metadataResult = spawnSync(oracle, ['--metadata']);
if (metadataResult.error !== undefined) {
  throw metadataResult.error;
}
if (metadataResult.status !== 0) {
  throw new Error(`Oracle metadata failed: ${metadataResult.stderr}`);
}
const oracleMetadata = JSON.parse(metadataResult.stdout.toString('utf8'));
const expectedOracleMetadata = {
  protocolVersion: 1,
  referenceRepository: REFERENCE_REPOSITORY,
  referenceCommit: REFERENCE_COMMIT,
};
if (oracleMetadata.protocolVersion !== expectedOracleMetadata.protocolVersion
  || oracleMetadata.referenceRepository !== expectedOracleMetadata.referenceRepository
  || oracleMetadata.referenceCommit !== expectedOracleMetadata.referenceCommit
  || Object.keys(oracleMetadata).length !== Object.keys(expectedOracleMetadata).length) {
  throw new Error(
    `Oracle metadata mismatch: expected ${JSON.stringify(expectedOracleMetadata)}, received ${JSON.stringify(oracleMetadata)}`,
  );
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const encodedBytes = (bytes) => ({
  encoding: 'base64',
  data: Buffer.from(bytes).toString('base64'),
  sha256: sha256(bytes),
});

const makeBytes = (width, height, channels, pixel) => {
  const bytes = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y);
      for (let channel = 0; channel < channels; channel += 1) {
        bytes[(y * width + x) * channels + channel] = values[channel];
      }
    }
  }
  return bytes;
};

const gray = (width, height, pixel) => makeBytes(
  width,
  height,
  1,
  (x, y) => [pixel(x, y)],
);

const rgb = (width, height, pixel) => makeBytes(width, height, 3, pixel);
const rgba = (width, height, pixel) => makeBytes(width, height, 4, pixel);

const seededBytes = (length, seed) => {
  let state = seed >>> 0;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
};

const compositeRgbaOverWhite = (source) => {
  const outputBytes = new Uint8Array(source.length / 4 * 3);
  for (let sourceIndex = 0, outputIndex = 0;
    sourceIndex < source.length;
    sourceIndex += 4, outputIndex += 3) {
    const alpha = source[sourceIndex + 3];
    for (let channel = 0; channel < 3; channel += 1) {
      const value = source[sourceIndex + channel];
      outputBytes[outputIndex + channel] = Math.floor(
        (value * alpha + 255 * (255 - alpha) + 127) / 255,
      );
    }
  }
  return outputBytes;
};

const equivalentGray = gray(31, 29, (x, y) => (x * 17 + y * 31 + x * y) & 0xff);

const specifications = [
  {
    id: 'minimum-gray-gradient-5x5',
    description: 'Minimum accepted dimensions with a two-axis gray gradient.',
    tags: ['minimum-dimensions', 'gradient'],
    width: 5,
    height: 5,
    format: 'gray8',
    bytes: gray(5, 5, (x, y) => x * 41 + y * 13),
  },
  {
    id: 'fast-path-gray-checkerboard-64x64',
    description: 'Exact 64 by 64 input exercises the reference fast path.',
    tags: ['fast-path-64x64', 'checkerboard'],
    width: 64,
    height: 64,
    format: 'gray8',
    bytes: gray(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 * 255),
  },
  {
    id: 'odd-rgb-gradient-17x19',
    description: 'Odd dimensions and independent RGB channel gradients.',
    tags: ['odd-dimensions', 'gradient'],
    width: 17,
    height: 19,
    format: 'rgb8',
    bytes: rgb(17, 19, (x, y) => [x * 15, y * 13, (x * 7 + y * 11) & 0xff]),
  },
  {
    id: 'extreme-wide-gray-edge-257x5',
    description: 'Minimum height and a wide horizontal aspect ratio with a hard edge.',
    tags: ['extreme-aspect-ratio', 'edge'],
    width: 257,
    height: 5,
    format: 'gray8',
    bytes: gray(257, 5, (x) => (x < 128 ? 16 : 240)),
  },
  {
    id: 'extreme-tall-rgb-edge-5x257',
    description: 'Minimum width and a tall vertical aspect ratio with a hard edge.',
    tags: ['extreme-aspect-ratio', 'edge'],
    width: 5,
    height: 257,
    format: 'rgb8',
    bytes: rgb(5, 257, (_x, y) => (y < 128 ? [240, 32, 16] : [8, 64, 224])),
  },
  {
    id: 'flat-gray-black-32x32',
    description: 'Uniform black gray input.',
    tags: ['flat-color'],
    width: 32,
    height: 32,
    format: 'gray8',
    bytes: gray(32, 32, () => 0),
  },
  {
    id: 'flat-rgb-white-32x32',
    description: 'Uniform white RGB input.',
    tags: ['flat-color'],
    width: 32,
    height: 32,
    format: 'rgb8',
    bytes: rgb(32, 32, () => [255, 255, 255]),
  },
  {
    id: 'odd-gray-vertical-edge-65x67',
    description: 'Odd dimensions with a centered vertical intensity edge.',
    tags: ['odd-dimensions', 'edge'],
    width: 65,
    height: 67,
    format: 'gray8',
    bytes: gray(65, 67, (x) => (x < 32 ? 24 : 224)),
  },
  {
    id: 'odd-rgb-checkerboard-33x35',
    description: 'Odd RGB checkerboard with channel-specific colors.',
    tags: ['odd-dimensions', 'checkerboard'],
    width: 33,
    height: 35,
    format: 'rgb8',
    bytes: rgb(33, 35, (x, y) => ((x + y) % 2 === 0
      ? [255, 32, 96]
      : [8, 192, 240])),
  },
  {
    id: 'equivalent-gray-pattern-31x29',
    description: 'Gray half of an equal-channel RGB equivalence pair.',
    tags: ['rgb-equals-gray'],
    width: 31,
    height: 29,
    format: 'gray8',
    bytes: equivalentGray,
    equivalenceGroup: 'equal-channel-31x29',
  },
  {
    id: 'equivalent-rgb-pattern-31x29',
    description: 'RGB half of an equal-channel gray equivalence pair.',
    tags: ['rgb-equals-gray'],
    width: 31,
    height: 29,
    format: 'rgb8',
    bytes: rgb(31, 29, (x, y) => {
      const value = equivalentGray[y * 31 + x];
      return [value, value, value];
    }),
    equivalenceGroup: 'equal-channel-31x29',
  },
  {
    id: 'rgba-transparent-black-23x21',
    description: 'Fully transparent black, normalized to opaque white RGB.',
    tags: ['alpha', 'flat-color'],
    width: 23,
    height: 21,
    format: 'rgba8',
    bytes: rgba(23, 21, () => [0, 0, 0, 0]),
  },
  {
    id: 'rgba-semitransparent-gradient-27x25',
    description: 'Gradient RGB and alpha channels composited over white.',
    tags: ['alpha', 'gradient', 'odd-dimensions'],
    width: 27,
    height: 25,
    format: 'rgba8',
    bytes: rgba(27, 25, (x, y) => [
      x * 9,
      y * 10,
      (x * 3 + y * 5) & 0xff,
      (x * 7 + y * 11) & 0xff,
    ]),
  },
  {
    id: 'seeded-random-gray-37x41',
    description: 'Deterministic xorshift32 gray bytes with seed 0x13579bdf.',
    tags: ['seeded-random'],
    width: 37,
    height: 41,
    format: 'gray8',
    bytes: seededBytes(37 * 41, 0x13579bdf),
  },
  {
    id: 'seeded-random-rgb-43x39',
    description: 'Deterministic xorshift32 RGB bytes with seed 0x2468ace0.',
    tags: ['seeded-random'],
    width: 43,
    height: 39,
    format: 'rgb8',
    bytes: seededBytes(43 * 39 * 3, 0x2468ace0),
  },
  {
    id: 'seeded-random-rgba-29x31',
    description: 'Deterministic xorshift32 RGBA bytes normalized over white.',
    tags: ['seeded-random', 'alpha', 'odd-dimensions'],
    width: 29,
    height: 31,
    format: 'rgba8',
    bytes: seededBytes(29 * 31 * 4, 0x10293847),
  },
];

const runOracle = (format, width, height, bytes) => {
  const result = spawnSync(
    oracle,
    [format, String(width), String(height)],
    { input: Buffer.from(bytes) },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Oracle failed for ${format} ${width}x${height}: ${result.stderr}`);
  }

  const parsed = JSON.parse(result.stdout.toString('utf8'));
  if (!/^[0-9a-f]{64}$/.test(parsed.hash)
    || !Number.isInteger(parsed.quality)
    || parsed.quality < 0
    || parsed.quality > 100) {
    throw new Error(`Oracle returned an invalid result: ${result.stdout}`);
  }
  return parsed;
};

const vectors = specifications.map((specification) => {
  const oracleFormat = specification.format === 'rgba8' ? 'rgb8' : specification.format;
  const oracleBytes = specification.format === 'rgba8'
    ? compositeRgbaOverWhite(specification.bytes)
    : specification.bytes;

  return {
    id: specification.id,
    description: specification.description,
    tags: specification.tags,
    width: specification.width,
    height: specification.height,
    format: specification.format,
    source: encodedBytes(specification.bytes),
    oracleInput: {
      format: oracleFormat,
      ...encodedBytes(oracleBytes),
    },
    expected: runOracle(
      oracleFormat,
      specification.width,
      specification.height,
      oracleBytes,
    ),
    ...(specification.equivalenceGroup === undefined
      ? {}
      : { equivalenceGroup: specification.equivalenceGroup }),
  };
});

const corpus = {
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  oracle: {
    repository: REFERENCE_REPOSITORY,
    commit: REFERENCE_COMMIT,
  },
  vectors,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${vectors.length} PDQ vectors to ${output}\n`);
