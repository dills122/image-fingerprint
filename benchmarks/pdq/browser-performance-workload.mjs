import { decodeImage, fingerprintImage } from '/lib/esm/browser.mjs';
import { fingerprintPixels } from '/lib/esm/core.mjs';
import { summarizeDurations, summarizeTimings } from './performance-metrics.mjs';
import { WASM_BUDGETS, WORKLOADS, createRgbWorkload } from './performance-profile.mjs';
import { createPdqWasmHasher, instantiatePdqWasm } from './performance-wasm.mjs';

const measureSync = (operation, warmupCount, sampleCount) => {
  let expected;
  for (let index = 0; index < warmupCount; index += 1) expected = operation();
  const samplesMs = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    const result = operation();
    samplesMs.push(performance.now() - startedAt);
    expected ??= result;
    if (result.hash !== expected.hash || result.quality !== expected.quality) {
      throw new Error('Fingerprint changed between retained browser samples');
    }
  }
  return { value: expected, samplesMs };
};

const measureAsync = async (operation, warmupCount, sampleCount, resultKey) => {
  let expected;
  for (let index = 0; index < warmupCount; index += 1) expected = await operation();
  const samplesMs = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    const result = await operation();
    samplesMs.push(performance.now() - startedAt);
    expected ??= result;
    if (resultKey !== undefined && result[resultKey] !== expected[resultKey]) {
      throw new Error(`${resultKey} changed between retained browser samples`);
    }
  }
  return { value: expected, samplesMs };
};

const samples = values => values.map(value => Number(value.toFixed(6)));

const timed = (values, pixels, maximumP95Ms) => {
  const summary = summarizeTimings(values, pixels);
  return {
    samplesMs: samples(values),
    summary,
    budget: { maximumP95Ms, passed: summary.p95Ms <= maximumP95Ms },
  };
};

export const runBrowserWorkload = async ({
  workloadId,
  warmupCount,
  sampleCount,
  fixtureUrl,
  wasmUrl,
  trace = false,
}) => {
  const progress = stage => {
    if (trace) console.log(`[pdq-performance] ${workloadId}: ${stage}`);
  };
  const workload = WORKLOADS.find(candidate => candidate.id === workloadId);
  if (workload === undefined) throw new Error(`Unknown browser workload: ${workloadId}`);
  progress('fetching-assets');
  const [fixtureResponse, wasmResponse] = await Promise.all([fetch(fixtureUrl), fetch(wasmUrl)]);
  if (!fixtureResponse.ok) throw new Error(`${workload.id} encoded fixture fetch failed`);
  if (!wasmResponse.ok) throw new Error('PDQ performance WASM fetch failed');
  const [blob, wasmBytes] = await Promise.all([
    fixtureResponse.blob(),
    wasmResponse.arrayBuffer(),
  ]);
  const compiledModule = await WebAssembly.compile(wasmBytes);
  progress('measuring-wasm-initialization');
  const initialization = await measureAsync(
    () => instantiatePdqWasm(compiledModule),
    warmupCount,
    sampleCount,
  );
  const wasmInstance = initialization.value;
  const rgb = createRgbWorkload(workload);
  progress('measuring-typescript-core');
  const pixelSource = {
    format: 'rgb8',
    width: workload.width,
    height: workload.height,
    data: rgb,
  };
  const core = measureSync(
    () => fingerprintPixels(pixelSource, { algorithm: 'pdq-v1' }),
    warmupCount,
    sampleCount,
  );
  const hasher = createPdqWasmHasher(wasmInstance, rgb, workload.width, workload.height);
  progress('measuring-wasm-core');
  let wasmCore;
  try {
    const conformant = hasher.hash();
    if (conformant.hash !== core.value.hash || conformant.quality !== core.value.quality) {
      throw new Error(`${workload.id} browser WASM result was not exactly conformant`);
    }
    wasmCore = measureSync(() => hasher.hash(), warmupCount, sampleCount);
    wasmCore.linearMemoryBytes = hasher.memoryBytes();
  } finally {
    hasher.dispose();
  }

  const decode = await measureAsync(
    () => decodeImage(blob),
    warmupCount,
    sampleCount,
  );
  progress('measuring-decoded-core');
  const decodedCore = measureSync(
    () => fingerprintPixels(decode.value, { algorithm: 'pdq-v1' }),
    warmupCount,
    sampleCount,
  );
  const adapter = await measureAsync(
    () => fingerprintImage(blob, { algorithm: 'pdq-v1' }),
    warmupCount,
    sampleCount,
    'hash',
  );
  progress('complete');
  if (decodedCore.value.hash !== adapter.value.hash
    || decodedCore.value.quality !== adapter.value.quality) {
    throw new Error(`${workload.id} browser adapter fingerprint changed between paths`);
  }

  return {
    id: workload.id,
    width: workload.width,
    height: workload.height,
    pixels: workload.pixels,
    fingerprint: core.value,
    adapterFingerprint: adapter.value,
    wasmInitialization: {
      samplesMs: samples(initialization.samplesMs),
      summary: summarizeDurations(initialization.samplesMs),
      budget: {
        maximumP95Ms: WASM_BUDGETS.warmInitializationP95Ms,
        passed: summarizeDurations(initialization.samplesMs).p95Ms
          <= WASM_BUDGETS.warmInitializationP95Ms,
      },
    },
    typescriptCore: timed(
      core.samplesMs,
      workload.pixels,
      workload.budgets.coreP95Ms,
    ),
    sameSourceWasmCore: {
      ...timed(wasmCore.samplesMs, workload.pixels, workload.budgets.coreP95Ms),
      linearMemoryBytes: wasmCore.linearMemoryBytes,
      exactConformance: true,
    },
    adapterDecode: {
      samplesMs: samples(decode.samplesMs),
      summary: summarizeTimings(decode.samplesMs, workload.pixels),
    },
    adapterHashDecoded: timed(
      decodedCore.samplesMs,
      workload.pixels,
      workload.budgets.coreP95Ms,
    ),
    adapterTotal: timed(
      adapter.samplesMs,
      workload.pixels,
      workload.budgets.adapterTotalP95Ms,
    ),
  };
};
