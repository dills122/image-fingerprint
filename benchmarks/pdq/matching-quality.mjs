#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateMatchingManifest } from './matching-quality-corpus.mjs';
import {
  evaluateMatchingPolicy,
  sweepMatchingPolicies,
} from './matching-quality-metrics.mjs';

const PROFILE_VERSION = 1;
const STARTING_POLICY = Object.freeze({ maxDistance: 31, minQuality: 50 });
const MAX_DISTANCES = Object.freeze([0, 5, 10, 15, 20, 25, 30, 31, 32, 35, 40, 50, 64, 80, 96, 128]);
const MIN_QUALITIES = Object.freeze([0, 25, 40, 49, 50, 51, 60, 70, 80, 90]);
const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));

const usage = () => [
  'Usage: node benchmarks/pdq/matching-quality.mjs --manifest <json> [options]',
  '',
  'Options:',
  '  --manifest <json>  Prepared local-only corpus manifest (required)',
  '  --output <json>    Also write the complete plan or measurement report',
  '  --plan-only        Validate metadata and print the frozen calibration plan',
  '  --help             Show this help',
].join('\n');

const parseArguments = (arguments_) => {
  const options = { manifest: undefined, output: undefined, planOnly: false, help: false };
  const valueArguments = new Set(['--manifest', '--output']);
  const booleanArguments = new Set(['--plan-only', '--help']);
  const seen = new Set();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!valueArguments.has(argument) && !booleanArguments.has(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`duplicate argument: ${argument}`);
    seen.add(argument);
    if (booleanArguments.has(argument)) {
      options[argument === '--plan-only' ? 'planOnly' : 'help'] = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    options[argument === '--manifest' ? 'manifest' : 'output'] = resolve(value);
  }
  if (!options.help && options.manifest === undefined) {
    throw new Error('--manifest is required');
  }
  return options;
};

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const readManifest = async (manifestPath) => {
  const bytes = await readFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`manifest was not valid JSON: ${error.message}`);
  }
  return {
    manifest: validateMatchingManifest(manifest),
    manifestSha256: sha256(bytes),
  };
};

const countBy = (values, key) => values.reduce((counts, value) => {
  counts[value[key]] = (counts[value[key]] ?? 0) + 1;
  return counts;
}, {});

const buildPlan = ({ manifest, manifestSha256 }) => {
  const relationships = countBy(manifest.pairs, 'expected');
  const scopes = countBy(manifest.pairs, 'scope');
  return {
    profileVersion: PROFILE_VERSION,
    mode: 'plan',
    algorithm: 'pdq-v1',
    matchingGoal: 'exact-printing',
    manifestSha256,
    source: manifest.source,
    sourceImages: manifest.source.sourceImages,
    fixtureCount: manifest.fixtures.length,
    pairCount: manifest.pairs.length,
    relationships: {
      matches: relationships.match ?? 0,
      nonMatches: relationships['non-match'] ?? 0,
    },
    scopes: {
      fullImage: scopes['full-image'] ?? 0,
      cropRegion: scopes['crop-region'] ?? 0,
    },
    startingPolicy: STARTING_POLICY,
    sweep: {
      maxDistances: MAX_DISTANCES,
      minQualities: MIN_QUALITIES,
      classification: 'quality-ineligible positives count as false negatives',
    },
    retainedEvidence: [
      'fingerprint-hashes',
      'fingerprint-qualities',
      'pair-distances',
      'pair-labels',
      'threshold-metrics',
      'hard-case-lists',
    ],
    packageBoundary: {
      coreCropSelection: false,
      callerSuppliedRegions: true,
      applicationThresholdsRemainCallerControlled: true,
    },
  };
};

const normalizedRegionToPixels = (region, image, fixtureId) => {
  const x = Math.floor(region.x * image.width);
  const y = Math.floor(region.y * image.height);
  const maximumX = Math.ceil((region.x + region.width) * image.width);
  const maximumY = Math.ceil((region.y + region.height) * image.height);
  const pixelRegion = {
    x,
    y,
    width: Math.min(image.width, maximumX) - x,
    height: Math.min(image.height, maximumY) - y,
  };
  if (pixelRegion.width < 5 || pixelRegion.height < 5) {
    throw new Error(`${fixtureId} normalized crop resolved below the 5-pixel minimum`);
  }
  return pixelRegion;
};

const loadRuntime = async () => {
  const nodeEntry = pathToFileURL(resolve(repositoryRoot, 'lib/node.js')).href;
  const coreEntry = pathToFileURL(resolve(repositoryRoot, 'lib/core/index.js')).href;
  try {
    const [nodeModule, coreModule] = await Promise.all([
      import(nodeEntry),
      import(coreEntry),
    ]);
    return {
      decodeImage: nodeModule.decodeImage,
      extractPixelRegion: coreModule.extractPixelRegion,
      fingerprintPixels: coreModule.fingerprintPixels,
      compareFingerprints: coreModule.compareFingerprints,
    };
  } catch (error) {
    throw new Error(`built package entrypoints are required; run pnpm build first: ${error.message}`);
  }
};

const measure = async (manifestPath, corpus, plan) => {
  const runtime = await loadRuntime();
  const manifestDirectory = dirname(manifestPath);
  const fingerprints = new Map();
  for (const fixture of corpus.manifest.fixtures) {
    const path = resolve(manifestDirectory, fixture.file);
    const bytes = await readFile(path);
    if (bytes.toString('utf8', 0, 42).startsWith('version https://git-lfs.github.com/spec')) {
      throw new Error(`${fixture.id} is a Git LFS pointer; fetch the dataset image objects first`);
    }
    if (bytes.byteLength !== fixture.byteLength || sha256(bytes) !== fixture.sha256) {
      throw new Error(`${fixture.id} bytes did not match the prepared manifest`);
    }
    const pixels = await runtime.decodeImage(path);
    fingerprints.set(`${fixture.id}:full`, {
      fingerprint: runtime.fingerprintPixels(pixels, { algorithm: 'pdq-v1' }),
      pixelRegion: undefined,
    });
    for (const [regionName, normalizedRegion] of Object.entries(fixture.regions)) {
      const pixelRegion = normalizedRegionToPixels(
        normalizedRegion,
        pixels,
        fixture.id,
      );
      const regionPixels = runtime.extractPixelRegion(pixels, pixelRegion);
      fingerprints.set(`${fixture.id}:${regionName}`, {
        fingerprint: runtime.fingerprintPixels(regionPixels, { algorithm: 'pdq-v1' }),
        pixelRegion,
      });
    }
  }

  const fingerprintEndpoint = (endpoint) => fingerprints.get(
    `${endpoint.fixture}:${endpoint.region ?? 'full'}`,
  );

  const measurements = corpus.manifest.pairs.map((pair) => {
    const left = fingerprintEndpoint(pair.left);
    const right = fingerprintEndpoint(pair.right);
    const comparison = runtime.compareFingerprints(left.fingerprint, right.fingerprint);
    if (!comparison.comparable || comparison.algorithm !== 'pdq-v1') {
      throw new Error(`${pair.id} produced incompatible fingerprints`);
    }
    return {
      id: pair.id,
      scope: pair.scope,
      expected: pair.expected,
      transformations: pair.transformations,
      left: {
        fixture: pair.left.fixture,
        region: pair.left.region,
        pixelRegion: left.pixelRegion,
        fingerprint: left.fingerprint,
      },
      right: {
        fixture: pair.right.fixture,
        region: pair.right.region,
        pixelRegion: right.pixelRegion,
        fingerprint: right.fingerprint,
      },
      distance: comparison.distance,
      leftQuality: left.fingerprint.quality,
      rightQuality: right.fingerprint.quality,
    };
  });
  const sweep = axes => sweepMatchingPolicies(axes, {
    maxDistances: MAX_DISTANCES,
    minQualities: MIN_QUALITIES,
  });
  const starting = pairs => evaluateMatchingPolicy(pairs, STARTING_POLICY);
  const positives = measurements.filter(pair => pair.expected === 'match');
  const negatives = measurements.filter(pair => pair.expected === 'non-match');
  const byDistanceDescending = (left, right) => right.distance - left.distance || left.id.localeCompare(right.id);
  const byDistanceAscending = (left, right) => left.distance - right.distance || left.id.localeCompare(right.id);

  return {
    ...plan,
    mode: 'measurement',
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    startingPolicyMetrics: {
      overall: starting(measurements),
      fullImage: starting(measurements.filter(pair => pair.scope === 'full-image')),
      cropRegion: starting(measurements.filter(pair => pair.scope === 'crop-region')),
    },
    thresholdSweep: {
      overall: sweep(measurements),
      fullImage: sweep(measurements.filter(pair => pair.scope === 'full-image')),
      cropRegion: sweep(measurements.filter(pair => pair.scope === 'crop-region')),
    },
    hardCases: {
      hardestPositives: [...positives].sort(byDistanceDescending).slice(0, 25).map(pair => pair.id),
      hardestNegatives: [...negatives].sort(byDistanceAscending).slice(0, 25).map(pair => pair.id),
      cropFailuresAtStartingPolicy: measurements
        .filter(pair => pair.scope === 'crop-region')
        .filter(pair => {
          const result = evaluateMatchingPolicy([pair], STARTING_POLICY);
          return result.falsePositives + result.falseNegatives > 0;
        })
        .map(pair => pair.id),
      lowQuality: measurements
        .filter(pair => Math.min(pair.leftQuality, pair.rightQuality) < STARTING_POLICY.minQuality)
        .map(pair => pair.id),
    },
    measurements,
  };
};

const writeReport = async (report, outputPath) => {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath !== undefined) await writeFile(outputPath, text);
  process.stdout.write(text);
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const corpus = await readManifest(options.manifest);
  const plan = buildPlan(corpus);
  const report = options.planOnly
    ? plan
    : await measure(options.manifest, corpus, plan);
  await writeReport(report, options.output);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
});
