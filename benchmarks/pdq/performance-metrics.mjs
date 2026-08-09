import { WASM_DECISION, WORKLOADS } from './performance-profile.mjs';

const assertSamples = samples => {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('samples must be a non-empty array');
  }
  if (samples.some(sample => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError('samples must contain finite, non-negative numbers');
  }
};

export const nearestRank = (samples, percentile) => {
  assertSamples(samples);
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError('percentile must be greater than 0 and at most 1');
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(percentile * ordered.length);
  return ordered[rank - 1];
};

const round = value => Number(value.toFixed(6));

export const summarizeTimings = (samples, pixels) => {
  assertSamples(samples);
  if (samples.some(sample => sample === 0)) {
    throw new RangeError('timing samples must be positive');
  }
  if (!Number.isSafeInteger(pixels) || pixels <= 0) {
    throw new RangeError('pixels must be a positive safe integer');
  }
  const summary = summarizeDurations(samples);
  return {
    ...summary,
    p50MegapixelsPerSecond: round(pixels / summary.p50Ms / 1_000),
    p95MegapixelsPerSecond: round(pixels / summary.p95Ms / 1_000),
  };
};

export const summarizeDurations = samples => {
  assertSamples(samples);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  return {
    count: samples.length,
    minMs: round(Math.min(...samples)),
    p50Ms: round(nearestRank(samples, 0.5)),
    p95Ms: round(nearestRank(samples, 0.95)),
    maxMs: round(Math.max(...samples)),
    meanMs: round(total / samples.length),
  };
};

export const decideWasmAdvancement = ({
  exactConformance,
  typescriptCoreP95Ms,
  wasmCoreP95Ms,
}) => {
  const speedupWorkloads = ['scan-2mp', 'high-resolution-12mp'];
  const requiredMeasurements = [
    ...WORKLOADS.map(workload => typescriptCoreP95Ms[workload.id]),
    ...speedupWorkloads.map(id => wasmCoreP95Ms[id]),
  ];
  if (requiredMeasurements.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('WASM decision measurements must be positive finite numbers');
  }
  if (!exactConformance) {
    return { advance: false, reason: 'wasm-conformance-failed' };
  }

  const missedBudget = WORKLOADS.some(
    workload => typescriptCoreP95Ms[workload.id] > workload.budgets.coreP95Ms,
  );
  if (missedBudget && WASM_DECISION.advanceWhenTypeScriptMissesBudget) {
    return { advance: true, reason: 'typescript-missed-core-budget' };
  }

  const meetsSpeedup = speedupWorkloads.every(id => (
    typescriptCoreP95Ms[id] / wasmCoreP95Ms[id]
      >= WASM_DECISION.minimumSpeedupAt2And12Mp
  ));
  if (meetsSpeedup) {
    return { advance: true, reason: 'wasm-at-least-2x-faster-at-2mp-and-12mp' };
  }

  return { advance: false, reason: 'insufficient-measured-benefit' };
};
