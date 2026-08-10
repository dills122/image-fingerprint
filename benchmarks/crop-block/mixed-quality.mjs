import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const THRESHOLDS = [0, 16, 32, 48, 64, 80, 96];
const SELECTED_THRESHOLD = 64;
const DIAGNOSTIC_BIT_BALANCES = [16, 32, 48, 64, 80, 96];
const PROFILE = {
  preprocessing: 'area-box',
  gridSize: 300,
  minimumArea: 500,
  maximumSegments: 16,
  fallback: 'empty',
  regionAlgorithm: 'blockhash-v1',
};
const POLICY = {
  strategy: 'one-to-one',
  maximumRegionDistance: SELECTED_THRESHOLD,
  minimumQueryCoverage: 0.25,
  requirePolarity: true,
  allowFallback: false,
};

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') return { planOnly: true };
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else throw new Error('Usage: mixed-quality.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Usage: mixed-quality.mjs --manifest FILE --output FILE');
  }
  return { planOnly: false, manifest, output };
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

const wilson = (successes, total, z = 1.959963984540054) => {
  if (total === 0) return null;
  const proportion = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (proportion + z ** 2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt(
    (proportion * (1 - proportion) / total) + (z ** 2 / (4 * total ** 2)),
  ) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
};

const metrics = (decisions) => {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  decisions.forEach(({ positive, matches }) => {
    if (positive && matches) counts.truePositive += 1;
    else if (positive) counts.falseNegative += 1;
    else if (matches) counts.falsePositive += 1;
    else counts.trueNegative += 1;
  });
  const positiveCount = counts.truePositive + counts.falseNegative;
  const negativeCount = counts.falsePositive + counts.trueNegative;
  return {
    ...counts,
    precision: counts.truePositive + counts.falsePositive === 0
      ? null : counts.truePositive / (counts.truePositive + counts.falsePositive),
    recall: positiveCount === 0 ? null : counts.truePositive / positiveCount,
    falsePositiveRate: negativeCount === 0 ? null : counts.falsePositive / negativeCount,
    recallWilson95: wilson(counts.truePositive, positiveCount),
    falsePositiveRateWilson95: wilson(counts.falsePositive, negativeCount),
  };
};

const crop = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const transform = (source, mode) => {
  if (mode === 'center') {
    const width = Math.max(16, Math.floor(source.width * 0.7));
    const height = Math.max(16, Math.floor(source.height * 0.7));
    return crop(source, Math.floor((source.width - width) / 2), Math.floor((source.height - height) / 2), width, height);
  }
  if (mode === 'asymmetric') {
    const width = Math.max(16, Math.floor(source.width * 0.62));
    const height = Math.max(16, Math.floor(source.height * 0.82));
    return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
  }
  const width = Math.max(16, Math.floor(source.width * 0.5));
  const height = Math.max(16, Math.floor(source.height * 0.65));
  return crop(source, source.width - width, Math.floor((source.height - height) / 4), width, height);
};

const validateManifest = (manifest) => {
  if (
    manifest.schemaVersion !== 1
    || manifest.corpus !== 'mixed-domain-crop-block-confirmation-v1'
    || !Array.isArray(manifest.images)
    || manifest.images.length < 25
  ) throw new Error('invalid mixed-domain crop-block manifest');
  const ids = new Set();
  manifest.images.forEach((image) => {
    if (
      typeof image.id !== 'string'
      || ids.has(image.id)
      || typeof image.domain !== 'string'
      || typeof image.file !== 'string'
      || !/^[0-9a-f]{64}$/.test(image.sha256)
      || typeof image.license !== 'string'
    ) throw new Error('invalid mixed-domain image entry');
    ids.add(image.id);
  });
};

const createPairs = (sources) => {
  const pairs = [];
  for (const source of sources) {
    for (const mode of ['center', 'asymmetric', 'severe']) {
      pairs.push({
        left: `${source.id}:original`,
        right: `${source.id}:${mode}`,
        positive: true,
        domain: source.domain,
        relationship: mode,
      });
    }
  }
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      const relationship = sources[left].domain === sources[right].domain
        ? 'unrelated-same-domain' : 'unrelated-cross-domain';
      const domainPair = [sources[left].domain, sources[right].domain].sort().join('::');
      for (const [leftVariant, rightVariant, variant] of [
        ['original', 'original', 'originals'],
        ['center', 'center', 'sibling-crops'],
        ['original', 'center', 'cross-transform'],
      ]) {
        pairs.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          domain: null,
          domainPair,
          relationship,
          variant,
        });
      }
    }
  }
  return pairs;
};

const run = async ({ manifest: manifestPath, output }) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const { compareFingerprints, fingerprintPixels } = require('../../lib/core/index.js');
  const {
    compareCropBlockSegments,
    cropBlockHammingDistance,
    fingerprintCropBlockExperiment,
  } = require('../../lib/core/algorithms/crop-block/index.js');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateManifest(manifest);
  const root = dirname(manifestPath);
  const cropFingerprints = new Map();
  const globalFingerprints = new Map([
    ['blockhash-v1', new Map()],
    ['pdq-v1', new Map()],
  ]);
  const generationTimes = [];
  const outputBytes = [];
  const segmentCounts = [];
  const decodedSources = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(root, entry.file));
    const digest = createHash('sha256').update(encoded).digest('hex');
    if (digest !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.id}`);
    const original = await decodeImage(encoded);
    decodedSources.push({ id: entry.id, domain: entry.domain });
    for (const [variant, source] of [
      ['original', original],
      ['center', transform(original, 'center')],
      ['asymmetric', transform(original, 'asymmetric')],
      ['severe', transform(original, 'severe')],
    ]) {
      const id = `${entry.id}:${variant}`;
      const started = performance.now();
      const fingerprint = fingerprintCropBlockExperiment(source, PROFILE);
      generationTimes.push(performance.now() - started);
      outputBytes.push(Buffer.byteLength(JSON.stringify(fingerprint)));
      segmentCounts.push(fingerprint.segments.length);
      cropFingerprints.set(id, fingerprint);
      globalFingerprints.get('blockhash-v1').set(id, fingerprintPixels(source, {
        algorithm: 'blockhash-v1', bitsPerSide: 16, method: 2,
      }));
      globalFingerprints.get('pdq-v1').set(id, fingerprintPixels(source, { algorithm: 'pdq-v1' }));
    }
  }
  const pairs = createPairs(decodedSources);
  const comparisonRuns = new Map(THRESHOLDS.map((threshold) => {
    const comparisonTimes = [];
    const evaluated = pairs.map((pair) => {
      const started = performance.now();
      const evidence = compareCropBlockSegments(
        cropFingerprints.get(pair.left).segments,
        cropFingerprints.get(pair.right).segments,
        POLICY.strategy,
        threshold,
        { allowFallback: POLICY.allowFallback, requirePolarity: POLICY.requirePolarity },
      );
      comparisonTimes.push(performance.now() - started);
      return { ...pair, evidence };
    });
    return [threshold, { evaluated, comparisonTimes }];
  }));
  const cropSweep = THRESHOLDS.map((threshold) => {
    const { evaluated, comparisonTimes } = comparisonRuns.get(threshold);
    const decisions = evaluated.map(({ evidence, ...pair }) => ({
      ...pair,
      matches: evidence.matchedRegions >= 1
        && evidence.queryCoverage >= POLICY.minimumQueryCoverage,
    }));
    const aggregate = metrics(decisions);
    return {
      threshold,
      ...aggregate,
      comparisonMilliseconds: summarize(comparisonTimes),
      positiveByDomain: Object.fromEntries(manifest.selection.domains.map((domain) => [
        domain, metrics(decisions.filter((decision) => decision.positive && decision.domain === domain)),
      ])),
      negativeByRelationship: Object.fromEntries(
        ['unrelated-same-domain', 'unrelated-cross-domain'].map((relationship) => [
          relationship,
          metrics(decisions.filter((decision) => !decision.positive && decision.relationship === relationship)),
        ]),
      ),
      negativeByVariant: Object.fromEntries(
        ['originals', 'sibling-crops', 'cross-transform'].map((variant) => [
          variant,
          metrics(decisions.filter((decision) => !decision.positive && decision.variant === variant)),
        ]),
      ),
      negativeByDomainPair: Object.fromEntries(
        [...new Set(decisions.filter((decision) => !decision.positive).map(({ domainPair }) => domainPair))]
          .sort()
          .map((domainPair) => [
            domainPair,
            metrics(decisions.filter((decision) => !decision.positive && decision.domainPair === domainPair)),
          ]),
      ),
    };
  });
  const diagnosticPolicySweep = [];
  for (const minimumMatchedRegions of [1, 2, 3]) {
    for (const minimumQueryCoverage of [0.25, 0.5, 0.75]) {
      for (const minimumCandidateCoverage of [0.25, 0.5, 0.75]) {
        diagnosticPolicySweep.push({
          minimumMatchedRegions,
          minimumQueryCoverage,
          minimumCandidateCoverage,
          sweep: THRESHOLDS.map((threshold) => ({
            threshold,
            ...metrics(comparisonRuns.get(threshold).evaluated.map(({ evidence, positive }) => ({
              positive,
              matches: evidence.matchedRegions >= minimumMatchedRegions
                && evidence.queryCoverage >= minimumQueryCoverage
                && evidence.candidateCoverage >= minimumCandidateCoverage,
            }))),
          })),
        });
      }
    }
  }
  const diagnosticBitBalanceSweep = [];
  for (const minimumBitBalance of DIAGNOSTIC_BIT_BALANCES) {
    const balanceRuns = new Map(THRESHOLDS.map((threshold) => [
      threshold,
      pairs.map((pair) => ({
        positive: pair.positive,
        evidence: compareCropBlockSegments(
          cropFingerprints.get(pair.left).segments,
          cropFingerprints.get(pair.right).segments,
          POLICY.strategy,
          threshold,
          {
            allowFallback: POLICY.allowFallback,
            minimumBitBalance,
            requirePolarity: POLICY.requirePolarity,
          },
        ),
      })),
    ]));
    for (const minimumMatchedRegions of [1, 2]) {
      for (const minimumQueryCoverage of [0.25, 0.5]) {
        for (const minimumCandidateCoverage of [0.25, 0.5]) {
          diagnosticBitBalanceSweep.push({
            minimumBitBalance,
            minimumMatchedRegions,
            minimumQueryCoverage,
            minimumCandidateCoverage,
            sweep: THRESHOLDS.map((threshold) => ({
              threshold,
              ...metrics(balanceRuns.get(threshold).map(({ evidence, positive }) => ({
                positive,
                matches: evidence.matchedRegions >= minimumMatchedRegions
                  && evidence.queryCoverage >= minimumQueryCoverage
                  && evidence.candidateCoverage >= minimumCandidateCoverage,
              }))),
            })),
          });
        }
      }
    }
  }
  const zeroHash = '0'.repeat(64);
  const diagnosticEligibleRegionSweep = [];
  for (const minimumBitBalance of DIAGNOSTIC_BIT_BALANCES) {
    const eligibleFingerprints = new Map([...cropFingerprints].map(([id, fingerprint]) => [
      id,
      fingerprint.segments.filter((segment) => {
        const ones = cropBlockHammingDistance(segment.hash, zeroHash);
        return Math.min(ones, 256 - ones) >= minimumBitBalance;
      }),
    ]));
    const eligibleRuns = new Map(THRESHOLDS.map((threshold) => [
      threshold,
      pairs.map((pair) => ({
        positive: pair.positive,
        evidence: compareCropBlockSegments(
          eligibleFingerprints.get(pair.left),
          eligibleFingerprints.get(pair.right),
          POLICY.strategy,
          threshold,
          { allowFallback: POLICY.allowFallback, requirePolarity: POLICY.requirePolarity },
        ),
      })),
    ]));
    for (const minimumMatchedRegions of [1, 2]) {
      for (const minimumQueryCoverage of [0.25, 0.5]) {
        for (const minimumCandidateCoverage of [0.25, 0.5]) {
          diagnosticEligibleRegionSweep.push({
            minimumBitBalance,
            minimumMatchedRegions,
            minimumQueryCoverage,
            minimumCandidateCoverage,
            coverageDenominator: 'eligible-regions',
            sweep: THRESHOLDS.map((threshold) => ({
              threshold,
              ...metrics(eligibleRuns.get(threshold).map(({ evidence, positive }) => ({
                positive,
                matches: evidence.matchedRegions >= minimumMatchedRegions
                  && evidence.queryCoverage >= minimumQueryCoverage
                  && evidence.candidateCoverage >= minimumCandidateCoverage,
              }))),
            })),
          });
        }
      }
    }
  }
  const baselines = [...globalFingerprints].map(([algorithm, fingerprints]) => ({
    algorithm,
    sweep: THRESHOLDS.map((threshold) => ({
      threshold,
      ...metrics(pairs.map((pair) => ({
        positive: pair.positive,
        matches: compareFingerprints(
          fingerprints.get(pair.left), fingerprints.get(pair.right),
        ).distance <= threshold,
      }))),
    })),
  }));
  const selected = cropSweep.find(({ threshold }) => threshold === SELECTED_THRESHOLD);
  const selectedBaselines = baselines.map((baseline) => ({
    algorithm: baseline.algorithm,
    ...baseline.sweep.find(({ threshold }) => threshold === SELECTED_THRESHOLD),
  }));
  const gate = {
    maximumFalsePositiveRate: 0.005,
    minimumRecallAdvantageOverEachGlobalBaseline: 0.1,
    falsePositiveRatePass: selected.falsePositiveRate <= 0.005,
    recallAdvantagePass: selectedBaselines.every((baseline) => (
      selected.recall - baseline.recall >= 0.1
    )),
  };
  gate.pass = gate.falsePositiveRatePass && gate.recallAdvantagePass;
  const report = {
    profileVersion: 1,
    corpus: manifest.corpus,
    sourceManifest: manifestPath,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    counts: {
      sourceImages: manifest.images.length,
      domains: Object.fromEntries(manifest.selection.domains.map((domain) => [
        domain, manifest.images.filter((image) => image.domain === domain).length,
      ])),
      positivePairs: pairs.filter((pair) => pair.positive).length,
      negativePairs: pairs.filter((pair) => !pair.positive).length,
    },
    sourceObjects: manifest.images.map(({
      id, domain, sourceType, title, descriptionURL, sha256, license, licenseURL,
    }) => ({ id, domain, sourceType, title, descriptionURL, sha256, license, licenseURL })),
    transformations: {
      center: 'center crop retaining approximately 49% area',
      asymmetric: 'left/asymmetric crop retaining approximately 50.8% area',
      severe: 'right/asymmetric crop retaining approximately 32.5% area',
    },
    selectedGenerationProfile: PROFILE,
    selectedComparisonPolicy: POLICY,
    resources: {
      generationMilliseconds: summarize(generationTimes),
      comparisonMilliseconds: selected.comparisonMilliseconds,
      outputBytes: summarize(outputBytes),
      segmentCount: summarize(segmentCounts),
    },
    cropBlockSweep: cropSweep,
    diagnosticPolicySweep,
    diagnosticBitBalanceSweep,
    diagnosticEligibleRegionSweep,
    baselines,
    confirmationGate: gate,
    limitations: [
      'Commons search and license metadata are auditable selection inputs, not a legal warranty.',
      'Screenshot and card-layout sources are deterministic generated fixtures rather than captures of third-party products.',
      'The corpus does not model rotation, perspective, overlays, inpainting, adversarial edits, or camera-frame detection.',
      'A larger independently sampled negative population is still required before claiming a rare production false-positive rate.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, counts: report.counts, confirmationGate: report.confirmationGate };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly
    ? {
      corpus: 'mixed-domain-crop-block-confirmation-v1',
      thresholds: THRESHOLDS,
      selectedGenerationProfile: PROFILE,
      selectedComparisonPolicy: POLICY,
      localOnly: true,
    }
    : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`mixed crop-block quality: ${error.message}\n`);
  process.exitCode = 2;
}
