import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { fingerprintImage } from '../lib/node.js';

const IMAGE_HASH_V7_ORACLE_SHA256 = 'cf4b11b6f9b6e2d0a0afd48aaba5c484043c780083b4c48f23c37da0032512bd';

const formats = ['jpeg', 'png', 'webp'];
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

const run = async () => {
  const candidateDigest = createHash('sha256');
  let comparisons = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const width = 32 + ((seed * 17) % 97);
    const height = 32 + ((seed * 29) % 89);
    const pattern = ['noise', 'gradient', 'alpha'][seed % 3];
    const raw = createPixels(width, height, seed, pattern);
    for (const format of formats) {
      const encoded = await encode(raw, width, height, format);
      for (const configuration of configurations) {
        comparisons += 1;
        const candidate = await fingerprintImage(encoded, {
          algorithm: 'blockhash-v1',
          ...configuration,
          decoderMode: 'image-hash-v7',
        });
        candidateDigest.update(`${JSON.stringify({
          seed,
          pattern,
          format,
          width,
          height,
          ...configuration,
          hash: candidate.hash,
        })}\n`);
      }
    }
  }

  const candidateSha256 = candidateDigest.digest('hex');
  return {
    profileVersion: 2,
    oracle: 'published-image-hash-7.0.1',
    oracleNpmShasum: '6d5a77d1cb7aa24c93d7d7729d6787d0023c85e9',
    expectedSha256: IMAGE_HASH_V7_ORACLE_SHA256,
    candidateSha256,
    seeds: 40,
    formats,
    configurations,
    comparisons,
    matchesOracle: candidateSha256 === IMAGE_HASH_V7_ORACLE_SHA256,
  };
};

try {
  if (process.argv.length !== 2) {
    throw new Error('Usage: node scripts/image-hash-v7-differential.mjs');
  }
  const report = await run();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.matchesOracle) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`image-hash-v7-differential: ${error.message}\n`);
  process.exitCode = 2;
}
