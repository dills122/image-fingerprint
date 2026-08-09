import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const REFERENCE_REPOSITORY = 'https://github.com/facebook/ThreatExchange.git';
const REFERENCE_COMMIT = 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424';
const DEFAULT_OUTPUT = resolve('__tests__/fixtures/pdq/stage-vectors.json');

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
    'Usage: node scripts/generate-pdq-stage-fixtures.mjs --oracle <binary> [--output <json>]',
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
if (JSON.stringify(oracleMetadata) !== JSON.stringify(expectedOracleMetadata)) {
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

const specifications = [
  {
    id: 'minimum-gray-gradient-5x5',
    description: 'Gray cast and center-based decimation at the minimum dimensions.',
    format: 'gray8',
    width: 5,
    height: 5,
    bytes: makeBytes(5, 5, 1, (x, y) => [(x * 41 + y * 13) & 0xff]),
    stages: ['luma', 'downsample', 'dct'],
  },
  {
    id: 'minimum-rgb-coefficients-5x5',
    description: 'RGB coefficient and float-operation ordering across channel extremes.',
    format: 'rgb8',
    width: 5,
    height: 5,
    bytes: makeBytes(5, 5, 3, (x, y) => [
      (x * 63 + y * 17) & 0xff,
      (x * 11 + y * 59) & 0xff,
      (x * 47 + y * 29) & 0xff,
    ]),
    stages: ['luma'],
  },
  {
    id: 'filtered-seeded-rgb-129x131',
    description: 'Two-axis, two-pass Jarosz filtering with nontrivial edge windows.',
    format: 'rgb8',
    width: 129,
    height: 131,
    bytes: seededBytes(129 * 131 * 3, 0x5eed1234),
    stages: ['downsample', 'dct'],
  },
];

const runDiagnostics = (specification) => {
  const result = spawnSync(
    oracle,
    [
      '--diagnostics',
      specification.format,
      String(specification.width),
      String(specification.height),
    ],
    { input: Buffer.from(specification.bytes), maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Oracle diagnostics failed for ${specification.id}: ${result.stderr}`);
  }

  const parsed = JSON.parse(result.stdout.toString('utf8'));
  if (!Array.isArray(parsed.lumaBits)
    || parsed.lumaBits.length !== specification.width * specification.height
    || !Array.isArray(parsed.downsampledBits)
    || parsed.downsampledBits.length !== 64 * 64
    || !Array.isArray(parsed.dctIntermediateBits)
    || parsed.dctIntermediateBits.length !== 16 * 64
    || !Array.isArray(parsed.dctOutputBits)
    || parsed.dctOutputBits.length !== 16 * 16
    || !Number.isInteger(parsed.medianBits)
    || typeof parsed.hash !== 'string'
    || !/^[0-9a-f]{64}$/.test(parsed.hash)
    || !Number.isInteger(parsed.quality)
    || parsed.quality < 0
    || parsed.quality > 100) {
    throw new Error(`Oracle returned invalid diagnostics for ${specification.id}`);
  }
  return parsed;
};

const vectors = specifications.map((specification) => {
  const diagnostics = runDiagnostics(specification);
  return {
    id: specification.id,
    description: specification.description,
    format: specification.format,
    width: specification.width,
    height: specification.height,
    source: encodedBytes(specification.bytes),
    expected: {
      ...(specification.stages.includes('luma')
        ? { lumaBits: diagnostics.lumaBits }
        : {}),
      ...(specification.stages.includes('downsample')
        ? {
          downsampledBits: diagnostics.downsampledBits,
          quality: diagnostics.quality,
        }
        : {}),
      ...(specification.stages.includes('dct')
        ? {
          dctIntermediateBits: diagnostics.dctIntermediateBits,
          dctOutputBits: diagnostics.dctOutputBits,
          medianBits: diagnostics.medianBits,
          hash: diagnostics.hash,
        }
        : {}),
    },
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
process.stdout.write(`Wrote ${vectors.length} PDQ stage vectors to ${output}\n`);
