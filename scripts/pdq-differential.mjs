import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const PROFILE_VERSION = 1;
const DEFAULT_SEED = 0x5eedc0de;
const DEFAULT_COUNT = 10000;
const MAXIMUM_COUNT = 100000;
const BATCH_MAGIC = Buffer.from('PDQB001', 'ascii');
const SOURCE_MAGIC = Buffer.from('PDQS001', 'ascii');
const PINNED_ORACLE = {
  protocolVersion: 1,
  referenceRepository: 'https://github.com/facebook/ThreatExchange.git',
  referenceCommit: 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424',
};
const FORMATS = ['gray8', 'rgb8', 'rgba8'];

const usage = () => [
  'Usage: node scripts/pdq-differential.mjs [options]',
  '',
  'Options:',
  '  --oracle <binary>  Pinned native PDQ oracle (required unless --plan-only)',
  `  --seed <uint32>    Decimal or 0x-prefixed seed (default: 0x${DEFAULT_SEED.toString(16)})`,
  `  --count <integer>  Number of vectors, 1-${MAXIMUM_COUNT} (default: ${DEFAULT_COUNT})`,
  '  --plan-only        Generate input checksums without hashing',
  '  --help             Show this help',
].join('\n');

const parseUint32 = (text) => {
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(text)) {
    throw new Error('seed must be an unsigned 32-bit decimal or hexadecimal integer');
  }
  const value = BigInt(text);
  if (value > 0xffffffffn) {
    throw new Error('seed must be between 0 and 4294967295');
  }
  return Number(value);
};

const parseCount = (text) => {
  if (!/^[0-9]+$/u.test(text)) {
    throw new Error('count must be an integer between 1 and 100000');
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_COUNT) {
    throw new Error('count must be an integer between 1 and 100000');
  }
  return value;
};

const parseArguments = (arguments_) => {
  const options = {
    seed: DEFAULT_SEED,
    count: DEFAULT_COUNT,
    oracle: undefined,
    planOnly: false,
    help: false,
  };
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!['--oracle', '--seed', '--count', '--plan-only', '--help'].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (seen.has(argument)) {
      throw new Error(`duplicate argument: ${argument}`);
    }
    seen.add(argument);

    if (argument === '--plan-only') {
      options.planOnly = true;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === '--oracle') {
        options.oracle = value;
      } else if (argument === '--seed') {
        options.seed = parseUint32(value);
      } else {
        options.count = parseCount(value);
      }
    }
  }
  if (!options.planOnly && !options.help && options.oracle === undefined) {
    throw new Error('--oracle is required unless --plan-only is used');
  }
  return options;
};

const normalizedSeed = (seed) => `0x${seed.toString(16).padStart(8, '0')}`;

class XorShift32 {
  constructor(seed) {
    this.state = seed;
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

const dimensionsFor = (index, random) => {
  if (index % 31 === 0) {
    return index % 2 === 0
      ? { width: 5, height: 5 + random.next() % 92 }
      : { width: 5 + random.next() % 92, height: 5 };
  }
  if (index % 29 === 0) {
    return { width: 64, height: 64 };
  }
  if (index % 37 === 0) {
    return index % 2 === 0
      ? { width: 5, height: 128 }
      : { width: 128, height: 5 };
  }
  return {
    width: 5 + random.next() % 92,
    height: 5 + random.next() % 92,
  };
};

const channelsFor = (format) => {
  if (format === 'gray8') {
    return 1;
  }
  if (format === 'rgb8') {
    return 3;
  }
  return 4;
};

const compositeRgbaOverWhite = (source) => {
  const output = new Uint8Array(source.length / 4 * 3);
  for (let sourceIndex = 0, outputIndex = 0;
    sourceIndex < source.length;
    sourceIndex += 4, outputIndex += 3) {
    const alpha = source[sourceIndex + 3];
    const whiteContribution = 255 * (255 - alpha);
    for (let channel = 0; channel < 3; channel += 1) {
      output[outputIndex + channel] = Math.floor(
        (
          source[sourceIndex + channel] * alpha
          + whiteContribution
          + 127
        ) / 255,
      );
    }
  }
  return output;
};

const uint32Header = (magic, count) => {
  const header = Buffer.alloc(magic.length + 4);
  magic.copy(header);
  header.writeUInt32LE(count, magic.length);
  return header;
};

const vectorHeader = (formatCode, width, height, byteLength) => {
  const header = Buffer.alloc(13);
  header.writeUInt8(formatCode, 0);
  header.writeUInt32LE(width, 1);
  header.writeUInt32LE(height, 5);
  header.writeUInt32LE(byteLength, 9);
  return header;
};

const generatePlan = (seed, count) => {
  const random = new XorShift32(seed);
  const formats = { gray8: 0, rgb8: 0, rgba8: 0 };
  const sourceHash = createHash('sha256');
  const sourceHeader = uint32Header(SOURCE_MAGIC, count);
  sourceHash.update(sourceHeader);
  const batchChunks = [uint32Header(BATCH_MAGIC, count)];
  const vectors = [];

  for (let index = 0; index < count; index += 1) {
    const format = FORMATS[index % FORMATS.length];
    const { width, height } = dimensionsFor(index, random);
    const source = new Uint8Array(width * height * channelsFor(format));
    for (let byteIndex = 0; byteIndex < source.length; byteIndex += 1) {
      source[byteIndex] = random.next() & 0xff;
    }
    formats[format] += 1;

    const sourceFormatCode = FORMATS.indexOf(format) + 1;
    sourceHash.update(vectorHeader(sourceFormatCode, width, height, source.length));
    sourceHash.update(source);

    const oracleInput = format === 'rgba8'
      ? compositeRgbaOverWhite(source)
      : source;
    const oracleFormat = format === 'gray8' ? 'gray8' : 'rgb8';
    batchChunks.push(
      vectorHeader(oracleFormat === 'gray8' ? 1 : 2, width, height, oracleInput.length),
      Buffer.from(oracleInput.buffer, oracleInput.byteOffset, oracleInput.byteLength),
    );
    vectors.push({ index, format, width, height, source });
  }

  const oracleInput = Buffer.concat(batchChunks);
  return {
    vectors,
    oracleInput,
    summary: {
      profileVersion: PROFILE_VERSION,
      mode: 'plan',
      seed: normalizedSeed(seed),
      count,
      formats,
      sourceSha256: sourceHash.digest('hex'),
      oracleInputSha256: createHash('sha256').update(oracleInput).digest('hex'),
    },
  };
};

const validateOracle = (oracle) => {
  const result = spawnSync(oracle, ['--metadata'], { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`oracle metadata failed: ${result.stderr.trim()}`);
  }
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    throw new Error('oracle metadata was not valid JSON');
  }
  if (JSON.stringify(metadata) !== JSON.stringify(PINNED_ORACLE)) {
    throw new Error(`oracle metadata did not match the pinned reference: ${result.stdout.trim()}`);
  }
  return metadata;
};

const loadFingerprintPixels = () => {
  const require = createRequire(import.meta.url);
  try {
    const core = require('../lib/core/index.js');
    return core.fingerprintPixels;
  } catch (error) {
    throw new Error(
      'built core was unavailable; run `pnpm build` before the differential test',
      { cause: error },
    );
  }
};

const parseOracleOutput = (result, count) => {
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`oracle batch failed: ${result.stderr.toString('utf8').trim()}`);
  }
  const output = result.stdout.toString('utf8').trim();
  const lines = output === '' ? [] : output.split('\n');
  if (lines.length !== count) {
    throw new Error(`oracle returned ${lines.length} results for ${count} requests`);
  }
  return lines.map((line, index) => {
    try {
      const parsed = JSON.parse(line);
      if (
        !/^[0-9a-f]{64}$/u.test(parsed.hash)
        || !Number.isInteger(parsed.quality)
        || parsed.quality < 0
        || parsed.quality > 100
      ) {
        throw new Error('invalid result shape');
      }
      return parsed;
    } catch (error) {
      throw new Error(`oracle result ${index} was invalid: ${line}`, { cause: error });
    }
  });
};

const runDifferential = (options, plan) => {
  const metadata = validateOracle(options.oracle);
  const fingerprintPixels = loadFingerprintPixels();
  const started = process.hrtime.bigint();
  const oracleProcess = spawnSync(options.oracle, ['--batch'], {
    input: plan.oracleInput,
    maxBuffer: Math.max(1024 * 1024, options.count * 256),
  });
  const oracleResults = parseOracleOutput(oracleProcess, options.count);
  const mismatches = [];
  let mismatchCount = 0;

  for (let index = 0; index < plan.vectors.length; index += 1) {
    const vector = plan.vectors[index];
    const fingerprint = fingerprintPixels(
      {
        format: vector.format,
        width: vector.width,
        height: vector.height,
        data: vector.source,
      },
      { algorithm: 'pdq-v1' },
    );
    const oracleResult = oracleResults[index];
    if (
      fingerprint.hash !== oracleResult.hash
      || fingerprint.quality !== oracleResult.quality
    ) {
      mismatchCount += 1;
      if (mismatches.length < 25) {
        mismatches.push({
          index: vector.index,
          format: vector.format,
          width: vector.width,
          height: vector.height,
          sourceEncoding: 'base64',
          source: Buffer.from(
            vector.source.buffer,
            vector.source.byteOffset,
            vector.source.byteLength,
          ).toString('base64'),
          typescript: {
            hash: fingerprint.hash,
            quality: fingerprint.quality,
          },
          oracle: oracleResult,
        });
      }
    }
  }

  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  return {
    ...plan.summary,
    mode: 'differential',
    oracle: metadata,
    exactMatches: options.count - mismatchCount,
    mismatchCount,
    reportedMismatches: mismatches,
    durationMs: Math.round(durationMs * 1000) / 1000,
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
  } else {
    const plan = generatePlan(options.seed, options.count);
    const report = options.planOnly ? plan.summary : runDifferential(options, plan);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!options.planOnly && report.mismatchCount !== 0) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write(`pdq-differential: ${error.message}\n${usage()}\n`);
  process.exitCode = 2;
}
