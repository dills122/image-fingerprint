import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const PROFILE = {
  maximumDimension: 384,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 12,
  fastThreshold: 20,
  verificationMaximumDimension: 96,
  colorVerificationMaximumDimension: 64,
};

const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
};

const fixture = (identity) => {
  const width = 320 + (identity % 5) * 24;
  const height = 256 + (identity % 4) * 20;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const checker = ((x >> (3 + identity % 3)) ^ (y >> 4)) & 1;
      const ring = Math.abs(
        (x - width / 2) ** 2 + (y - height / 2) ** 2 - (50 + identity % 30) ** 2,
      ) < 320;
      data[index] = (x * (identity * 2 + 3) + y * 5 + checker * 71) & 255;
      data[index + 1] = (x * 7 + y * (identity + 11) + (ring ? 83 : 0)) & 255;
      data[index + 2] = (x * y + identity * 29 + checker * 47 + (ring ? 113 : 0)) & 255;
      data[index + 3] = (x + y + identity) % 23 === 0 ? 151 : 255;
    }
  }
  return { format: 'rgba8', width, height, data };
};

const centerCrop = (source) => {
  const insetX = Math.floor(source.width / 9);
  const insetY = Math.floor(source.height / 10);
  const width = source.width - insetX * 2;
  const height = source.height - insetY * 2;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const start = ((y + insetY) * source.width + insetX) * 4;
    data.set(source.data.subarray(start, start + width * 4), y * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const run = () => {
  const require = createRequire(import.meta.url);
  const {
    compareCropLocalItemSourceToCrop,
    fingerprintCropLocalItemExperiment,
    packCropLocalItemExperimentFingerprint,
    compareCropLocalItemPackedSourceToCrop,
    unpackCropLocalItemExperimentFingerprint,
  } = require('../../lib/core/algorithms/crop-local/index.js');
  for (let identity = 0; identity < 4; identity += 1) {
    fingerprintCropLocalItemExperiment(fixture(identity), PROFILE);
  }
  const fingerprints = [];
  const generationMilliseconds = [];
  const outputBytes = [];
  const packingMilliseconds = [];
  const packedOutputBytes = [];
  const packedFingerprints = [];
  for (let identity = 4; identity < 44; identity += 1) {
    const source = fixture(identity);
    const variants = [source, centerCrop(source)];
    const pair = variants.map((pixels) => {
      const started = performance.now();
      const fingerprint = fingerprintCropLocalItemExperiment(pixels, PROFILE);
      generationMilliseconds.push(performance.now() - started);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      return fingerprint;
    });
    fingerprints.push(pair);
    const packedPair = pair.map((fingerprint) => {
      const started = performance.now();
      const packed = packCropLocalItemExperimentFingerprint(fingerprint);
      packingMilliseconds.push(performance.now() - started);
      packedOutputBytes.push(Buffer.byteLength(JSON.stringify(packed)));
      return JSON.parse(JSON.stringify(packed));
    });
    packedFingerprints.push(packedPair);
  }
  const comparisonMilliseconds = [];
  const decisions = [];
  fingerprints.forEach(([source, crop], index) => {
    const started = performance.now();
    const result = compareCropLocalItemSourceToCrop(source, crop);
    comparisonMilliseconds.push(performance.now() - started);
    decisions.push([index, index, result.status, result.reasons]);
  });
  for (let left = 0; left < fingerprints.length; left += 1) {
    for (let right = left + 1; right < fingerprints.length; right += 1) {
      const started = performance.now();
      const result = compareCropLocalItemSourceToCrop(
        fingerprints[left][0],
        fingerprints[right][0],
      );
      comparisonMilliseconds.push(performance.now() - started);
      decisions.push([left, right, result.status, result.reasons]);
    }
  }
  const serialized = JSON.stringify(fingerprints);
  const unpackingMilliseconds = [];
  for (const pair of packedFingerprints) {
    for (const packed of pair) {
      const started = performance.now();
      unpackCropLocalItemExperimentFingerprint(packed);
      unpackingMilliseconds.push(performance.now() - started);
    }
  }
  const packedComparisonMilliseconds = [];
  const packedDecisions = [];
  packedFingerprints.forEach(([source, crop], index) => {
    const started = performance.now();
    const result = compareCropLocalItemPackedSourceToCrop(source, crop);
    packedComparisonMilliseconds.push(performance.now() - started);
    packedDecisions.push([index, index, result.status, result.reasons]);
  });
  for (let left = 0; left < packedFingerprints.length; left += 1) {
    for (let right = left + 1; right < packedFingerprints.length; right += 1) {
      const started = performance.now();
      const result = compareCropLocalItemPackedSourceToCrop(
        packedFingerprints[left][0],
        packedFingerprints[right][0],
      );
      packedComparisonMilliseconds.push(performance.now() - started);
      packedDecisions.push([left, right, result.status, result.reasons]);
    }
  }
  const unpacked = packedFingerprints.map(pair => pair.map(
    packed => unpackCropLocalItemExperimentFingerprint(packed),
  ));
  const fingerprintSha256 = createHash('sha256').update(serialized).digest('hex');
  const decisionSha256 = createHash('sha256').update(JSON.stringify(decisions)).digest('hex');
  const packedDecisionSha256 = createHash('sha256')
    .update(JSON.stringify(packedDecisions))
    .digest('hex');
  return {
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    fixtureProfile: { identities: fingerprints.length, variantsPerIdentity: 2 },
    fingerprintProfile: PROFILE,
    resources: {
      generationMilliseconds: summarize(generationMilliseconds),
      comparisonMilliseconds: summarize(comparisonMilliseconds),
      outputBytes: summarize(outputBytes),
      packingMilliseconds: summarize(packingMilliseconds),
      packedGenerationMilliseconds: summarize(
        generationMilliseconds.map((value, index) => value + packingMilliseconds[index]),
      ),
      unpackingMilliseconds: summarize(unpackingMilliseconds),
      packedComparisonMilliseconds: summarize(packedComparisonMilliseconds),
      packedOutputBytes: summarize(packedOutputBytes),
    },
    exactness: {
      fingerprintSha256,
      unpackedFingerprintSha256: createHash('sha256')
        .update(JSON.stringify(unpacked))
        .digest('hex'),
      decisionSha256,
      packedDecisionSha256,
      fingerprintsExact: fingerprintSha256 === createHash('sha256')
        .update(JSON.stringify(unpacked))
        .digest('hex'),
      decisionsExact: decisionSha256 === packedDecisionSha256,
      decisions: decisions.length,
    },
  };
};

const outputIndex = process.argv.indexOf('--output');
const baselineIndex = process.argv.indexOf('--baseline');
const current = run();
const result = baselineIndex === -1 ? current : {
  study: 'crop-local-item-color-v0-exact-output-and-packed-v0-performance',
  baselineCommit: '9bfd550',
  baseline: JSON.parse(await readFile(resolve(process.argv[baselineIndex + 1]), 'utf8')),
  optimized: current,
};
if (outputIndex === -1) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const output = resolve(process.argv[outputIndex + 1]);
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, ...result })}\n`);
}
