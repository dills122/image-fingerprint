import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REFERENCE_REPOSITORY = 'https://github.com/facebook/ThreatExchange.git';
const REFERENCE_COMMIT = 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424';
const EMSCRIPTEN_IMAGE = 'emscripten/emsdk@sha256:6143f5b3d58fe6e7faf9f279d27ea9ea975983ee2b5490478abda126a6762f34';
const RAW_FIXTURE = resolve('__tests__/fixtures/pdq/raw-vectors.json');
const STAGE_FIXTURE = resolve('__tests__/fixtures/pdq/stage-vectors.json');

const parseArguments = (arguments_) => {
  const allowed = new Set(['--node', '--oracle-js']);
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
const node = arguments_.get('--node') ?? process.execPath;
const oracleJsArgument = arguments_.get('--oracle-js');
if (oracleJsArgument === undefined) {
  throw new Error(
    'Usage: node scripts/compare-pdq-wasm-oracle.mjs --oracle-js <file> [--node <binary>]',
  );
}
const oracleJs = resolve(oracleJsArgument);

const runOracle = (oracleArguments, input) => {
  const result = spawnSync(node, [oracleJs, ...oracleArguments], {
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8');
    throw new Error(
      `WASM oracle failed with status ${result.status}: ${stderr.slice(-2_000)}`,
    );
  }
  return JSON.parse(result.stdout.toString('utf8'));
};

const metadata = runOracle(['--metadata']);
const expectedMetadata = {
  protocolVersion: 1,
  referenceRepository: REFERENCE_REPOSITORY,
  referenceCommit: REFERENCE_COMMIT,
};
if (JSON.stringify(metadata) !== JSON.stringify(expectedMetadata)) {
  throw new Error(
    `WASM oracle metadata mismatch: expected ${JSON.stringify(expectedMetadata)}, received ${JSON.stringify(metadata)}`,
  );
}

const [rawCorpus, stageCorpus] = await Promise.all([
  readFile(RAW_FIXTURE, 'utf8').then(JSON.parse),
  readFile(STAGE_FIXTURE, 'utf8').then(JSON.parse),
]);

const bitCount = (hex) => {
  let value = BigInt(`0x${hex}`);
  let count = 0;
  while (value !== 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
};

const rawMismatches = [];
for (const vector of rawCorpus.vectors) {
  const actual = runOracle(
    [vector.oracleInput.format, String(vector.width), String(vector.height)],
    Buffer.from(vector.oracleInput.data, 'base64'),
  );
  if (actual.hash !== vector.expected.hash || actual.quality !== vector.expected.quality) {
    rawMismatches.push({
      id: vector.id,
      expected: vector.expected,
      actual,
      hashDistance: bitCount(
        (BigInt(`0x${vector.expected.hash}`) ^ BigInt(`0x${actual.hash}`))
          .toString(16),
      ),
    });
  }
}

const arrayDifference = (expected, actual, label) => {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new Error(
      `Invalid ${label}: expected ${expected.length} values, received ${actual?.length ?? 'non-array'}`,
    );
  }
  let count = 0;
  let firstIndex;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      count += 1;
      firstIndex ??= index;
    }
  }
  return count === 0
    ? undefined
    : {
      count,
      firstIndex,
      expected: expected[firstIndex],
      actual: actual[firstIndex],
    };
};

const stageMappings = [
  ['lumaBits', 'lumaBits'],
  ['downsampledBits', 'downsampledBits'],
  ['dctMatrixBits', 'dctIntermediateBits'],
  ['dctIntermediateBits', 'dctIntermediateBits'],
  ['dctOutputBits', 'dctOutputBits'],
];
const stageMismatches = [];
for (const vector of stageCorpus.vectors) {
  const actual = runOracle(
    ['--diagnostics', vector.format, String(vector.width), String(vector.height)],
    Buffer.from(vector.source.data, 'base64'),
  );
  const differences = {};
  for (const [expectedName, actualName] of stageMappings) {
    if (vector.expected[expectedName] !== undefined) {
      const difference = arrayDifference(
        vector.expected[expectedName],
        actual[actualName],
        `${vector.id}.${actualName}`,
      );
      if (difference !== undefined) {
        differences[expectedName] = difference;
      }
    }
  }
  for (const name of ['medianBits', 'hash', 'quality']) {
    if (vector.expected[name] !== undefined && vector.expected[name] !== actual[name]) {
      differences[name] = {
        expected: vector.expected[name],
        actual: actual[name],
      };
    }
  }
  if (Object.keys(differences).length > 0) {
    stageMismatches.push({ id: vector.id, differences });
  }
}

const report = {
  oracle: {
    compiler: EMSCRIPTEN_IMAGE,
    sourceCommit: REFERENCE_COMMIT,
  },
  raw: {
    total: rawCorpus.vectors.length,
    matching: rawCorpus.vectors.length - rawMismatches.length,
    mismatches: rawMismatches,
  },
  stages: {
    total: stageCorpus.vectors.length,
    matching: stageCorpus.vectors.length - stageMismatches.length,
    mismatches: stageMismatches,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (rawMismatches.length > 0 || stageMismatches.length > 0) {
  process.exitCode = 1;
}
