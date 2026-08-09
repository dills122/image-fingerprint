import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { fingerprintImage } from '../lib/node.js';

const require = createRequire(import.meta.url);

const parseArguments = (arguments_) => {
  if (arguments_.length === 0) return { oracle: '../lib/index.js' };
  if (arguments_.length === 2 && arguments_[0] === '--oracle') {
    return { oracle: resolve(arguments_[1]) };
  }
  throw new Error('Usage: node scripts/image-hash-v7-differential.mjs [--oracle /path/to/lib/index.js]');
};

const formats = [
  { name: 'jpeg', mime: 'image/jpeg' },
  { name: 'png', mime: 'image/png' },
  { name: 'webp', mime: 'image/webp' },
];
const configurations = [
  { bitsPerSide: 4, method: 1 },
  { bitsPerSide: 4, method: 2 },
  { bitsPerSide: 8, method: 1 },
  { bitsPerSide: 8, method: 2 },
  { bitsPerSide: 16, method: 1 },
  { bitsPerSide: 16, method: 2 },
];

const createPixels = (width, height, seed, pattern) => {
  const data = Buffer.alloc(width * height * 4);
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pattern === 'noise') {
        data[offset] = random() & 0xff;
        data[offset + 1] = random() & 0xff;
        data[offset + 2] = random() & 0xff;
        data[offset + 3] = 255;
      } else if (pattern === 'alpha') {
        data[offset] = (x * 17 + seed) & 0xff;
        data[offset + 1] = (y * 29 + seed * 3) & 0xff;
        data[offset + 2] = ((x + y) * 11 + seed * 5) & 0xff;
        data[offset + 3] = random() & 0xff;
      } else {
        data[offset] = Math.round(255 * x / Math.max(1, width - 1));
        data[offset + 1] = Math.round(255 * y / Math.max(1, height - 1));
        data[offset + 2] = (x * 7 + y * 13 + seed) & 0xff;
        data[offset + 3] = 255;
      }
    }
  }
  return data;
};

const encode = async (raw, width, height, format) => {
  const pipeline = sharp(raw, { raw: { width, height, channels: 4 } });
  if (format === 'jpeg') {
    return pipeline.jpeg({
      quality: 31 + (width % 60),
      chromaSubsampling: '4:2:0',
    }).toBuffer();
  }
  if (format === 'webp') {
    return pipeline.webp({ quality: 37 + (height % 50) }).toBuffer();
  }
  return pipeline.png({
    compressionLevel: width % 10,
    palette: width % 2 === 0,
  }).toBuffer();
};

const legacyHash = (imageHash, encoded, mime, configuration) => new Promise((resolveHash, reject) => {
  imageHash({ data: encoded, ext: mime }, configuration.bitsPerSide, configuration.method === 2, (
    error,
    hash,
  ) => {
    if (error) reject(error);
    else resolveHash(hash);
  });
});

const run = async (oracleModule) => {
  const loaded = require(oracleModule);
  if (typeof loaded.imageHash !== 'function') {
    throw new TypeError(`Oracle module does not export imageHash(): ${oracleModule}`);
  }

  const mismatches = [];
  let comparisons = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const width = 32 + ((seed * 17) % 97);
    const height = 32 + ((seed * 29) % 89);
    const pattern = ['noise', 'gradient', 'alpha'][seed % 3];
    const raw = createPixels(width, height, seed, pattern);
    for (const format of formats) {
      const encoded = await encode(raw, width, height, format.name);
      for (const configuration of configurations) {
        comparisons += 1;
        const legacy = await legacyHash(
          loaded.imageHash,
          encoded,
          format.mime,
          configuration,
        );
        const candidate = await fingerprintImage(encoded, {
          algorithm: 'blockhash-v1',
          ...configuration,
          decoderMode: 'image-hash-v7',
        });
        if (legacy !== candidate.hash) {
          mismatches.push({
            seed,
            pattern,
            format: format.name,
            width,
            height,
            ...configuration,
            legacy,
            candidate: candidate.hash,
          });
        }
      }
    }
  }

  return {
    profileVersion: 1,
    oracleModule,
    seeds: 40,
    formats: formats.map(({ name }) => name),
    configurations,
    comparisons,
    matches: comparisons - mismatches.length,
    mismatchCount: mismatches.length,
    mismatchExamples: mismatches.slice(0, 20),
  };
};

try {
  const { oracle } = parseArguments(process.argv.slice(2));
  const report = await run(oracle);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.mismatchCount > 0) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`image-hash-v7-differential: ${error.message}\n`);
  process.exitCode = 2;
}
