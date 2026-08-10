import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const PLAN = {
  profileVersion: 1,
  corpus: 'procedural-structured-v1',
  preprocessors: ['bilinear-gaussian', 'area-box'],
  segmentCaps: [16, 32, 64, null],
  fallbacks: ['full-image', 'empty'],
  strategies: ['directed', 'mutual', 'one-to-one'],
  regionDistanceThresholds: [16, 24, 32, 48, 64, 80, 96, 112, 128],
  qualityControls: {
    minimumBitBalances: [0, 16, 32, 48, 64],
    requirePolarity: [false, true],
    minimumQueryCoverage: [0.25, 0.5],
  },
  childHashCandidates: [
    { regionAlgorithm: 'blockhash-v1', minimumQualities: [0] },
    { regionAlgorithm: 'pdq-v1', minimumQualities: [0, 25, 50] },
  ],
  baselines: ['blockhash-v1-16-2', 'pdq-v1'],
};

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') return { planOnly: true };
  if (arguments_.length === 0) return { planOnly: false };
  if (arguments_.length === 2 && arguments_[0] === '--output') {
    return { planOnly: false, output: resolve(arguments_[1]) };
  }
  throw new Error('Usage: node benchmarks/crop-block/experiment.mjs [--plan-only|--output FILE]');
};

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
};

const summarize = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  maximum: values.length === 0 ? null : Math.max(...values),
});

const createPattern = (seed, width = 192, height = 144) => {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const data = new Uint8Array(width * height * 4);
  const background = 25 + seed * 11;
  for (let index = 0; index < data.length; index += 4) {
    data.set([background, background + 8, background + 16, 255], index);
  }
  for (let shape = 0; shape < 18; shape += 1) {
    const x0 = random() % (width - 32);
    const y0 = random() % (height - 24);
    const shapeWidth = 12 + random() % 52;
    const shapeHeight = 10 + random() % 44;
    const value = 40 + random() % 200;
    for (let y = y0; y < Math.min(height, y0 + shapeHeight); y += 1) {
      for (let x = x0; x < Math.min(width, x0 + shapeWidth); x += 1) {
        const index = (y * width + x) * 4;
        data.set([value, (value * 3 + seed * 17) % 256, 255 - value, 255], index);
      }
    }
  }
  return { format: 'rgba8', width, height, data };
};

const crop = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const brighten = (source, delta) => {
  const data = source.data.slice();
  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.min(255, data[index] + delta);
    data[index + 1] = Math.min(255, data[index + 1] + delta);
    data[index + 2] = Math.min(255, data[index + 2] + delta);
  }
  return { ...source, data };
};

const createTiledPattern = () => {
  const width = 240;
  const height = 240;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 30) + Math.floor(y / 30)) % 2 === 0 ? 24 : 232;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { format: 'rgba8', width, height, data };
};

const createFlat = (value, alpha = 255) => {
  const width = 96;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set([value, value, value, alpha], index);
  }
  return { format: 'rgba8', width, height, data };
};

const buildCorpus = () => {
  const images = [];
  const pairs = [];
  for (let seed = 1; seed <= 4; seed += 1) {
    const original = createPattern(seed);
    const originalId = `pattern-${seed}`;
    images.push({ id: originalId, source: original, transform: 'original' });
    const center = crop(original, 29, 22, 134, 100);
    const asymmetric = brighten(crop(original, 0, 8, 122, 122), 8);
    for (const transformed of [
      { id: `${originalId}-center`, source: center, transform: 'center-crop-retained-area-48.5%' },
      { id: `${originalId}-asymmetric`, source: asymmetric, transform: 'left-asymmetric-crop-plus-8-brightness' },
    ]) {
      images.push(transformed);
      pairs.push({ left: originalId, right: transformed.id, positive: true, transform: transformed.transform });
    }
  }
  for (let left = 1; left <= 4; left += 1) {
    for (let right = left + 1; right <= 4; right += 1) {
      pairs.push({
        left: `pattern-${left}`,
        right: `pattern-${right}`,
        positive: false,
        transform: 'unrelated-structured',
      });
      pairs.push({
        left: `pattern-${left}-center`,
        right: `pattern-${right}-center`,
        positive: false,
        transform: 'unrelated-sibling-crops',
      });
    }
  }
  const tiled = createTiledPattern();
  images.push({ id: 'many-regions', source: tiled, transform: 'original' });
  images.push({
    id: 'many-regions-center',
    source: crop(tiled, 30, 30, 180, 180),
    transform: 'center-crop-retained-area-56.25%',
  });
  pairs.push({
    left: 'many-regions',
    right: 'many-regions-center',
    positive: true,
    transform: 'center-crop-retained-area-56.25%',
  });

  const lowInformation = [
    { id: 'flat-black', source: createFlat(0), transform: 'low-information' },
    { id: 'flat-white', source: createFlat(255), transform: 'low-information' },
    { id: 'flat-transparent', source: createFlat(0, 0), transform: 'low-information' },
  ];
  images.push(...lowInformation);
  for (let left = 0; left < lowInformation.length; left += 1) {
    for (let right = left + 1; right < lowInformation.length; right += 1) {
      pairs.push({
        left: lowInformation[left].id,
        right: lowInformation[right].id,
        positive: false,
        transform: 'unrelated-low-information',
      });
    }
  }
  return { images, pairs };
};

const metrics = (decisions) => {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  decisions.forEach(({ positive, matches }) => {
    if (positive && matches) truePositive += 1;
    else if (positive) falseNegative += 1;
    else if (matches) falsePositive += 1;
    else trueNegative += 1;
  });
  const precision = truePositive + falsePositive === 0
    ? null
    : truePositive / (truePositive + falsePositive);
  const recall = truePositive + falseNegative === 0
    ? null
    : truePositive / (truePositive + falseNegative);
  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision,
    recall,
    falsePositiveRate: falsePositive / (falsePositive + trueNegative),
    falseNegativeRate: falseNegative / (falseNegative + truePositive),
  };
};

const run = async () => {
  const require = createRequire(import.meta.url);
  const {
    compareCropBlockSegments,
    fingerprintCropBlockExperiment,
  } = require('../../lib/core/algorithms/crop-block/index.js');
  const { compareFingerprints, fingerprintPixels } = require('../../lib/core/index.js');
  const corpus = buildCorpus();
  const byId = new Map(corpus.images.map((image) => [image.id, image]));
  const heapBefore = process.memoryUsage().heapUsed;
  const candidates = [];

  for (const preprocessing of PLAN.preprocessors) {
    for (const maximumSegments of PLAN.segmentCaps) {
      for (const fallback of PLAN.fallbacks) {
        const fingerprints = new Map();
        const generationTimes = [];
        const outputBytes = [];
        for (const image of corpus.images) {
          const started = performance.now();
          const fingerprint = fingerprintCropBlockExperiment(image.source, {
            preprocessing,
            maximumSegments,
            fallback,
          });
          generationTimes.push(performance.now() - started);
          outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
          fingerprints.set(image.id, fingerprint);
        }
        const comparisons = {};
        for (const strategy of PLAN.strategies) {
          const sweep = [];
          for (const threshold of PLAN.regionDistanceThresholds) {
            const comparisonTimes = [];
            const decisions = corpus.pairs.map((pair) => {
              const left = fingerprints.get(pair.left);
              const right = fingerprints.get(pair.right);
              const started = performance.now();
              const evidence = compareCropBlockSegments(
                left.segments,
                right.segments,
                strategy,
                threshold,
              );
              comparisonTimes.push(performance.now() - started);
              const fallbackOnly = left.segments.every((segment) => segment.kind === 'fallback')
                || right.segments.every((segment) => segment.kind === 'fallback');
              return {
                positive: pair.positive,
                matches: !fallbackOnly
                  && evidence.matchedRegions >= 1
                  && evidence.queryCoverage >= 0.25,
              };
            });
            sweep.push({ threshold, ...metrics(decisions), comparisonMilliseconds: summarize(comparisonTimes) });
          }
          comparisons[strategy] = sweep;
        }
        const counts = [...fingerprints.values()].map((fingerprint) => fingerprint.segments.length);
        candidates.push({
          preprocessing,
          maximumSegments,
          fallback,
          generationMilliseconds: summarize(generationTimes),
          outputBytes: summarize(outputBytes),
          segmentCount: summarize(counts),
          fallbackOnlyRate: [...fingerprints.values()].filter(
            (fingerprint) => fingerprint.segments.length > 0
              && fingerprint.segments.every((segment) => segment.kind === 'fallback'),
          ).length / fingerprints.size,
          comparisons,
        });
      }
    }
  }

  const baselines = [];
  for (const algorithm of PLAN.baselines) {
    const options = algorithm === 'pdq-v1'
      ? { algorithm: 'pdq-v1' }
      : { algorithm: 'blockhash-v1', bitsPerSide: 16, method: 2 };
    const fingerprints = new Map(corpus.images.map((image) => [
      image.id,
      fingerprintPixels(image.source, options),
    ]));
    const distances = corpus.pairs.map((pair) => ({
      positive: pair.positive,
      distance: compareFingerprints(
        fingerprints.get(pair.left),
        fingerprints.get(pair.right),
      ).distance,
    }));
    baselines.push({
      algorithm,
      sweep: PLAN.regionDistanceThresholds.map((threshold) => ({
        threshold,
        ...metrics(distances.map((pair) => ({
          positive: pair.positive,
          matches: pair.distance <= threshold,
        }))),
      })),
    });
  }

  const selectedFingerprints = new Map(corpus.images.map((image) => [
    image.id,
    fingerprintCropBlockExperiment(image.source, {
      preprocessing: 'area-box',
      maximumSegments: 16,
      fallback: 'empty',
    }),
  ]));
  const qualityControls = [];
  for (const minimumBitBalance of PLAN.qualityControls.minimumBitBalances) {
    for (const requirePolarity of PLAN.qualityControls.requirePolarity) {
      for (const minimumQueryCoverage of PLAN.qualityControls.minimumQueryCoverage) {
        const sweep = PLAN.regionDistanceThresholds.map((threshold) => ({
          threshold,
          ...metrics(corpus.pairs.map((pair) => {
            const evidence = compareCropBlockSegments(
              selectedFingerprints.get(pair.left).segments,
              selectedFingerprints.get(pair.right).segments,
              'one-to-one',
              threshold,
              { allowFallback: false, minimumBitBalance, requirePolarity },
            );
            return {
              positive: pair.positive,
              matches: evidence.matchedRegions >= 1
                && evidence.queryCoverage >= minimumQueryCoverage,
            };
          })),
        }));
        qualityControls.push({
          minimumBitBalance,
          requirePolarity,
          minimumQueryCoverage,
          sweep,
        });
      }
    }
  }

  const childHashBakeoff = [];
  for (const candidate of PLAN.childHashCandidates) {
    const fingerprints = new Map();
    const generationTimes = [];
    const outputBytes = [];
    for (const image of corpus.images) {
      const started = performance.now();
      const fingerprint = fingerprintCropBlockExperiment(image.source, {
        preprocessing: 'area-box',
        maximumSegments: 16,
        fallback: 'empty',
        regionAlgorithm: candidate.regionAlgorithm,
      });
      generationTimes.push(performance.now() - started);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      fingerprints.set(image.id, fingerprint);
    }
    const qualities = [...fingerprints.values()].flatMap((fingerprint) => (
      fingerprint.segments.flatMap((segment) => (
        segment.quality === undefined ? [] : [segment.quality]
      ))
    ));
    childHashBakeoff.push({
      regionAlgorithm: candidate.regionAlgorithm,
      generationMilliseconds: summarize(generationTimes),
      outputBytes: summarize(outputBytes),
      childQuality: summarize(qualities),
      policies: candidate.minimumQualities.map((minimumQuality) => ({
        minimumQuality,
        requirePolarity: true,
        minimumQueryCoverage: 0.25,
        sweep: PLAN.regionDistanceThresholds.map((threshold) => {
          const comparisonTimes = [];
          const result = metrics(corpus.pairs.map((pair) => {
            const started = performance.now();
            const evidence = compareCropBlockSegments(
              fingerprints.get(pair.left).segments,
              fingerprints.get(pair.right).segments,
              'one-to-one', threshold,
              { allowFallback: false, minimumQuality, requirePolarity: true },
            );
            comparisonTimes.push(performance.now() - started);
            return {
              positive: pair.positive,
              matches: evidence.matchedRegions >= 1
                && evidence.queryCoverage >= 0.25,
            };
          }));
          return { threshold, ...result, comparisonMilliseconds: summarize(comparisonTimes) };
        }),
      })),
    });
  }

  return {
    ...PLAN,
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    corpusSummary: {
      images: corpus.images.length,
      positivePairs: corpus.pairs.filter((pair) => pair.positive).length,
      negativePairs: corpus.pairs.filter((pair) => !pair.positive).length,
      provenance: 'deterministic procedural generation; no external images',
    },
    approximateHeapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    candidates,
    baselines,
    qualityControls,
    childHashBakeoff,
    limitations: [
      'Procedural evidence cannot select a public production threshold.',
      'The small negative set cannot support rare false-positive claims or confidence intervals.',
      'Real licensed images and browser/worker equality remain release gates.',
    ],
  };
};

try {
  const arguments_ = parseArguments(process.argv.slice(2));
  const report = arguments_.planOnly ? PLAN : await run();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (arguments_.output === undefined) process.stdout.write(serialized);
  else {
    await mkdir(dirname(arguments_.output), { recursive: true });
    await writeFile(arguments_.output, serialized);
    process.stdout.write(`${arguments_.output}\n`);
  }
} catch (error) {
  process.stderr.write(`crop-block experiment: ${error.message}\n`);
  process.exitCode = 2;
}
