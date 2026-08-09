export const PERFORMANCE_PROFILE_VERSION = 1;
export const PERFORMANCE_PATTERN = 'pdq-performance-rgb-v1';
export const DEFAULT_WARMUP_COUNT = 5;
export const DEFAULT_SAMPLE_COUNT = 30;

export const ADAPTER_FIXTURE = Object.freeze({
  format: 'png',
  compressionLevel: 3,
  generatedOutsideTiming: true,
  maximumEncodedBytes: 32 * 1024 * 1024,
});

export const WORKLOADS = Object.freeze([
  Object.freeze({
    id: 'region-0.25mp',
    width: 500,
    height: 500,
    pixels: 250_000,
    budgets: Object.freeze({
      coreP95Ms: 20,
      adapterTotalP95Ms: 100,
      browserMainThreadMaxMs: 50,
    }),
  }),
  Object.freeze({
    id: 'scan-2mp',
    width: 1600,
    height: 1250,
    pixels: 2_000_000,
    budgets: Object.freeze({
      coreP95Ms: 100,
      adapterTotalP95Ms: 400,
      browserWorkerHeartbeatP95Ms: 50,
    }),
  }),
  Object.freeze({
    id: 'high-resolution-12mp',
    width: 4000,
    height: 3000,
    pixels: 12_000_000,
    budgets: Object.freeze({
      coreP95Ms: 500,
      adapterTotalP95Ms: 2_000,
      browserWorkerHeartbeatP95Ms: 50,
      nodeCoreIncrementalPeakRssMiB: 384,
      nodeAdapterIncrementalPeakRssMiB: 512,
    }),
  }),
]);

export const WASM_BUDGETS = Object.freeze({
  rawBytes: 300 * 1024,
  gzipBytes: 150 * 1024,
  warmInitializationP95Ms: 50,
});

export const WASM_DECISION = Object.freeze({
  minimumSpeedupAt2And12Mp: 2,
  requireExactConformance: true,
  advanceWhenTypeScriptMissesBudget: true,
  automaticRuntimeSelection: false,
});

export const createRgbWorkload = ({ width, height }) => {
  const rgb = new Uint8Array(width * height * 3);
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rgb[offset] = (Math.imul(x, 17) + Math.imul(y, 11) + Math.imul(x >>> 3, 23)) & 0xff;
      rgb[offset + 1] = (Math.imul(x, 5) + Math.imul(y, 19) + Math.imul(y >>> 4, 29)) & 0xff;
      rgb[offset + 2] = (Math.imul(x ^ y, 13) + Math.imul(x, y)) & 0xff;
      offset += 3;
    }
  }

  return rgb;
};
