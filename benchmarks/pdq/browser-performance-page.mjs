import { summarizeDurations } from './performance-metrics.mjs';
import { WORKLOADS } from './performance-profile.mjs';
import { runBrowserWorkload } from './browser-performance-workload.mjs';

const runWorker = configuration => new Promise((resolve, reject) => {
  const worker = new Worker(
    new URL('./browser-performance-worker.mjs', import.meta.url),
    { type: 'module' },
  );
  worker.onmessage = event => {
    worker.terminate();
    if (event.data.ok) resolve(event.data.result);
    else reject(new Error(event.data.error));
  };
  worker.onerror = event => {
    worker.terminate();
    reject(new Error(event.message));
  };
  worker.postMessage(configuration);
});

const runWorkerWithHeartbeat = async configuration => {
  const heartbeatIntervalMs = 10;
  const delays = [];
  let previous = performance.now();
  const timer = setInterval(() => {
    const current = performance.now();
    delays.push(Math.max(0, current - previous - heartbeatIntervalMs));
    previous = current;
  }, heartbeatIntervalMs);
  try {
    const result = await runWorker(configuration);
    const retained = delays.length === 0 ? [0] : delays;
    const summary = summarizeDurations(retained);
    return {
      ...result,
      executionContext: 'dedicated-worker',
      responsiveness: {
        heartbeatIntervalMs,
        samplesMs: retained.map(value => Number(value.toFixed(6))),
        summary,
        budget: {
          maximumP95Ms: 50,
          passed: summary.p95Ms <= 50,
        },
      },
    };
  } finally {
    clearInterval(timer);
  }
};

export const runPdqBrowserPerformance = async configuration => {
  const results = [];
  const selectedWorkloads = configuration.workloadId === undefined
    ? WORKLOADS
    : WORKLOADS.filter(workload => workload.id === configuration.workloadId);
  for (const workload of selectedWorkloads) {
    const workloadConfiguration = {
      ...configuration,
      workloadId: workload.id,
      fixtureUrl: `/fixtures/${encodeURIComponent(workload.id)}.png`,
    };
    if (workload.id === 'region-0.25mp') {
      const result = await runBrowserWorkload(workloadConfiguration);
      const maximumSampleMs = Math.max(
        ...result.wasmInitialization.samplesMs,
        ...result.typescriptCore.samplesMs,
        ...result.sameSourceWasmCore.samplesMs,
        ...result.adapterDecode.samplesMs,
        ...result.adapterHashDecoded.samplesMs,
        ...result.adapterTotal.samplesMs,
      );
      results.push({
        ...result,
        executionContext: 'main-thread',
        responsiveness: {
          measuredOperation: 'maximum-retained-timed-operation',
          maximumSampleMs,
          budget: {
            maximumSampleMs: 50,
            passed: maximumSampleMs <= 50,
          },
        },
      });
    } else {
      results.push(await runWorkerWithHeartbeat(workloadConfiguration));
    }
  }
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated,
    userAgent: navigator.userAgent,
    userAgentMemoryApi: typeof performance.measureUserAgentSpecificMemory === 'function',
    results,
  };
};

globalThis.runPdqBrowserPerformance = runPdqBrowserPerformance;
