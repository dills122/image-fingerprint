import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { relative, resolve } from 'node:path';
import {
  buildCropLocalItemColorRetrievalIndex,
  CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
  loadCropLocalItemColorRetrievalIndex,
  queryCropLocalItemColorRetrievalIndex,
  queryCropLocalItemColorRetrievalIndexExactWand,
  serializeCropLocalItemColorRetrievalIndex,
} from './item-color-retrieval-index.mjs';

const PLAN = Object.freeze({
  profileVersion: 1,
  study: 'crop-local-item-color-retrieval-mechanical-scaling-v1',
  referenceCounts: [500, 1_000, 2_000],
  queriesPerScale: 40,
  featuresPerReference: 96,
  queryFeatures: 72,
  broadFeaturesPerReference: 32,
  broadTokenValuesPerPosition: 512,
  descriptorTokenBits: 16,
  candidateLimit: CROP_LOCAL_ITEM_COLOR_CANDIDATE_LIMIT,
  corpus: 'deterministic-generated-descriptor-mechanics-only',
  assertions: [
    'loaded-ranking-exact',
    'true-source-recall-at-1',
    'candidate-limit-bounded',
  ],
  optimizationAcceptance: [
    'candidate-ranking-sha256-unchanged-at-every-scale',
    'index-statistics-unchanged-at-every-scale',
    'serialized-bytes-lower-at-every-scale',
    '2000-reference-load-managed-memory-growth-lower-than-baseline',
    '2000-reference-query-p50-no-more-than-10-percent-higher-than-baseline',
  ],
  selectiveAcceptance: [
    'candidate-ranking-sha256-unchanged-at-every-scale',
    '2000-reference-candidates-scored-p50-at-most-25-percent',
    '2000-reference-posting-entries-inspected-p50-at-most-50-percent',
    '2000-reference-query-p50-no-more-than-10-percent-higher-than-compact-full-sort',
  ],
});

const parseArguments = (arguments_) => {
  let output;
  let baseline;
  let planOnly = false;
  let queryStrategy = 'full-sort';
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') continue;
    if (argument === '--plan-only') planOnly = true;
    else if (argument === '--output') output = resolve(arguments_[index += 1]);
    else if (argument === '--baseline') baseline = resolve(arguments_[index += 1]);
    else if (argument === '--query-strategy') queryStrategy = arguments_[index += 1];
    else throw new Error('Usage: retrieval-scaling.mjs [--plan-only] [--query-strategy full-sort|exact-wand] [--baseline FILE] [--output FILE]');
  }
  if (queryStrategy !== 'full-sort' && queryStrategy !== 'exact-wand') {
    throw new Error('query strategy must be full-sort or exact-wand');
  }
  if (planOnly && (output !== undefined || baseline !== undefined || queryStrategy !== 'full-sort')) {
    throw new Error('--plan-only cannot be combined with output, baseline, or a query strategy');
  }
  return { baseline, output, planOnly, queryStrategy };
};

const mix = (input) => {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
};

const descriptor = (referenceIndex, featureIndex) => {
  let output = '';
  for (let position = 0; position < 16; position += 1) {
    const seed = (
      Math.imul(referenceIndex + 1, 0x9e3779b1)
      ^ Math.imul(featureIndex + 1, 0x85ebca6b)
      ^ Math.imul(position + 1, 0xc2b2ae35)
    );
    const value = featureIndex < PLAN.broadFeaturesPerReference
      ? mix(seed) % PLAN.broadTokenValuesPerPosition
      : mix(seed) & 0xffff;
    output += value.toString(16).padStart(4, '0');
  }
  return output;
};

const fingerprint = (referenceIndex, featureCount = PLAN.featuresPerReference) => ({
  experimentalProfile: 'crop-local-item-color-v0',
  local: {
    features: Array.from({ length: featureCount }, (_, featureIndex) => ({
      descriptor: descriptor(referenceIndex, featureIndex),
    })),
  },
});

const idWidth = referenceCount => String(referenceCount - 1).length;
const referenceId = (referenceIndex, referenceCount) => (
  `reference-${String(referenceIndex).padStart(idWidth(referenceCount), '0')}`
);

const queryIndexes = (referenceCount) => {
  const count = Math.min(PLAN.queriesPerScale, referenceCount);
  return Array.from(
    { length: count },
    (_, index) => Math.floor(index * (referenceCount - 1) / Math.max(1, count - 1)),
  );
};

const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = fraction => sorted[Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * fraction),
  )];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
};

const memory = () => {
  globalThis.gc?.();
  const usage = process.memoryUsage();
  return {
    arrayBuffersBytes: usage.arrayBuffers,
    heapUsedBytes: usage.heapUsed,
    residentSetBytes: usage.rss,
  };
};

const measureQueries = (index, referenceCount, queryStrategy) => {
  const query = queryStrategy === 'exact-wand'
    ? queryCropLocalItemColorRetrievalIndexExactWand
    : queryCropLocalItemColorRetrievalIndex;
  const rows = [];
  for (const referenceIndex of queryIndexes(referenceCount)) {
    const started = performance.now();
    const result = query(
      index,
      fingerprint(referenceIndex, PLAN.queryFeatures),
      PLAN.candidateLimit,
    );
    rows.push({
      referenceIndex,
      expectedId: referenceId(referenceIndex, referenceCount),
      milliseconds: performance.now() - started,
      ...result,
    });
  }
  return rows;
};

const runScale = (referenceCount, queryStrategy) => {
  let references = Array.from({ length: referenceCount }, (_, referenceIndex) => ({
    id: referenceId(referenceIndex, referenceCount),
    fingerprint: fingerprint(referenceIndex),
  }));
  const beforeBuild = memory();
  let started = performance.now();
  let index = buildCropLocalItemColorRetrievalIndex(references);
  const buildMilliseconds = performance.now() - started;
  const afterBuild = memory();

  started = performance.now();
  const serialized = serializeCropLocalItemColorRetrievalIndex(index);
  const serializationMilliseconds = performance.now() - started;
  const serializedBytes = Buffer.byteLength(serialized);
  const builtRows = measureQueries(index, referenceCount, queryStrategy);

  references = null;
  index = null;
  const beforeLoad = memory();
  started = performance.now();
  const loaded = loadCropLocalItemColorRetrievalIndex(serialized);
  const loadMilliseconds = performance.now() - started;
  const afterLoad = memory();
  const loadedRows = measureQueries(loaded, referenceCount, queryStrategy);

  const builtRankings = builtRows.map(({ candidates }) => candidates);
  const loadedRankings = loadedRows.map(({ candidates }) => candidates);
  const serializedBuiltRankings = JSON.stringify(builtRankings);
  const serializedLoadedRankings = JSON.stringify(loadedRankings);
  const loadedRankingExact = serializedBuiltRankings === serializedLoadedRankings;
  const trueSourceAtOne = loadedRows.filter(row => row.candidates[0]?.id === row.expectedId).length;
  const boundedCandidates = loadedRows.every(row => row.candidates.length <= PLAN.candidateLimit);
  if (!loadedRankingExact || trueSourceAtOne !== loadedRows.length || !boundedCandidates) {
    throw new Error(`retrieval scaling assertions failed at ${referenceCount} references`);
  }

  const selectivity = queryStrategy === 'exact-wand' ? {
    candidatesScored: summarize(loadedRows.map(row => row.candidatesScored)),
    candidatesScoredFraction: summarize(
      loadedRows.map(row => row.candidatesScored / referenceCount),
    ),
    postingEntriesAvailable: summarize(loadedRows.map(row => row.postingEntriesAvailable)),
    postingEntriesInspected: summarize(loadedRows.map(row => row.postingEntriesInspected)),
    postingEntriesInspectedFraction: summarize(
      loadedRows.map(row => row.postingEntriesInspected / row.postingEntriesAvailable),
    ),
    postingEntriesSkipped: summarize(loadedRows.map(row => row.postingEntriesSkipped)),
  } : {
    candidatesWithEvidence: summarize(loadedRows.map(row => row.candidatesWithEvidence)),
    candidatesWithEvidenceFraction: summarize(
      loadedRows.map(row => row.candidatesWithEvidence / referenceCount),
    ),
    postingEntriesVisited: summarize(loadedRows.map(row => row.postingEntriesVisited)),
    postingEntriesVisitedPerReference: summarize(
      loadedRows.map(row => row.postingEntriesVisited / referenceCount),
    ),
  };

  return {
    referenceCount,
    queries: loadedRows.length,
    index: {
      serializedFormat: loaded.document.postingEncoding === undefined
        ? 'deterministic-json-ordinal-arrays-v1'
        : `deterministic-json-${loaded.document.postingEncoding}`,
      serializedBytes,
      bytesPerReference: serializedBytes / referenceCount,
      sha256: createHash('sha256').update(serialized).digest('hex'),
      ...loaded.document.statistics,
    },
    resources: {
      buildMilliseconds,
      serializationMilliseconds,
      loadMilliseconds,
      buildHeapGrowthBytes: afterBuild.heapUsedBytes - beforeBuild.heapUsedBytes,
      buildArrayBufferGrowthBytes: afterBuild.arrayBuffersBytes - beforeBuild.arrayBuffersBytes,
      buildResidentSetGrowthBytes: afterBuild.residentSetBytes - beforeBuild.residentSetBytes,
      loadHeapGrowthBytes: afterLoad.heapUsedBytes - beforeLoad.heapUsedBytes,
      loadArrayBufferGrowthBytes: afterLoad.arrayBuffersBytes - beforeLoad.arrayBuffersBytes,
      loadResidentSetGrowthBytes: afterLoad.residentSetBytes - beforeLoad.residentSetBytes,
      queryMilliseconds: summarize(loadedRows.map(({ milliseconds }) => milliseconds)),
    },
    selectivity,
    exactness: {
      loadedRankingExact,
      candidateRankingSha256: createHash('sha256')
        .update(serializedLoadedRankings)
        .digest('hex'),
      trueSourceRecallAt1: trueSourceAtOne / loadedRows.length,
      candidateLimitBounded: boundedCandidates,
    },
  };
};

const run = queryStrategy => ({
  ...PLAN,
  queryStrategy,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    exposedGarbageCollector: typeof globalThis.gc === 'function',
  },
  scales: PLAN.referenceCounts.map(referenceCount => runScale(referenceCount, queryStrategy)),
});

try {
  const { baseline, output, planOnly, queryStrategy } = parseArguments(process.argv.slice(2));
  const current = planOnly ? PLAN : run(queryStrategy);
  let report = current;
  if (baseline !== undefined) {
    const baselineEnvelope = JSON.parse(await readFile(baseline, 'utf8'));
    const baselineReport = baselineEnvelope.optimizedReport ?? baselineEnvelope;
    const comparisons = current.scales.map((scale, index) => ({
      referenceCount: scale.referenceCount,
      rankingExact: scale.exactness.candidateRankingSha256
        === baselineReport.scales[index]?.exactness?.candidateRankingSha256,
      indexStatisticsExact: JSON.stringify({
        indexedTokens: scale.index.indexedTokens,
        postingEntries: scale.index.postingEntries,
        droppedHighFrequencyTokens: scale.index.droppedHighFrequencyTokens,
      }) === JSON.stringify({
        indexedTokens: baselineReport.scales[index]?.index?.indexedTokens,
        postingEntries: baselineReport.scales[index]?.index?.postingEntries,
        droppedHighFrequencyTokens: baselineReport.scales[index]?.index?.droppedHighFrequencyTokens,
      }),
      serializedBytesChange: scale.index.serializedBytes
        / baselineReport.scales[index].index.serializedBytes - 1,
      loadHeapGrowthChange: scale.resources.loadHeapGrowthBytes
        / baselineReport.scales[index].resources.loadHeapGrowthBytes - 1,
      loadManagedMemoryGrowthChange: (
        scale.resources.loadHeapGrowthBytes + scale.resources.loadArrayBufferGrowthBytes
      ) / (
        baselineReport.scales[index].resources.loadHeapGrowthBytes
        + (baselineReport.scales[index].resources.loadArrayBufferGrowthBytes ?? 0)
      ) - 1,
      queryP50Change: scale.resources.queryMilliseconds.p50
        / baselineReport.scales[index].resources.queryMilliseconds.p50 - 1,
      queryP95Change: scale.resources.queryMilliseconds.p95
        / baselineReport.scales[index].resources.queryMilliseconds.p95 - 1,
    }));
    if (comparisons.some(result => !result.rankingExact || !result.indexStatisticsExact)) {
      throw new Error('retrieval optimization changed ranking or index statistics');
    }
    const largestScale = comparisons.at(-1);
    const selective = current.queryStrategy === 'exact-wand';
    if (selective) {
      largestScale.candidatesScoredP50Fraction = current.scales.at(-1)
        .selectivity.candidatesScoredFraction.p50;
      largestScale.postingEntriesInspectedP50Fraction = current.scales.at(-1)
        .selectivity.postingEntriesInspectedFraction.p50;
    }
    const acceptance = selective ? {
      largestScaleCandidatesScoredWithinBudget: largestScale.candidatesScoredP50Fraction <= 0.25,
      largestScalePostingEntriesInspectedWithinBudget:
        largestScale.postingEntriesInspectedP50Fraction <= 0.5,
      largestScaleQueryP50WithinBudget: largestScale.queryP50Change <= 0.1,
    } : {
      serializedBytesLowerAtEveryScale: comparisons.every(result => result.serializedBytesChange < 0),
      largestScaleLoadManagedMemoryGrowthLower: largestScale.loadManagedMemoryGrowthChange < 0,
      largestScaleQueryP50WithinBudget: largestScale.queryP50Change <= 0.1,
    };
    const accepted = Object.values(acceptance).every(Boolean);
    report = {
      profileVersion: 1,
      study: selective
        ? 'crop-local-item-color-retrieval-exact-wand-v1'
        : 'crop-local-item-color-retrieval-index-optimization-v1',
      baseline: relative(process.cwd(), baseline),
      accepted,
      decision: accepted ? 'accept' : 'reject-acceptance-gate-failed',
      acceptance,
      comparisons,
      baselineReport,
      optimizedReport: current,
    };
  }
  if (output !== undefined) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output === undefined ? report : { output, ...report })}\n`);
} catch (error) {
  process.stderr.write(`crop-local retrieval scaling: ${error.message}\n`);
  process.exitCode = 2;
}
