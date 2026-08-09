import { createHash } from 'node:crypto';
import {
  ADAPTER_FIXTURE,
  PERFORMANCE_PATTERN,
  PERFORMANCE_PROFILE_VERSION,
  WASM_BUDGETS,
  WASM_DECISION,
  WORKLOADS,
  createRgbWorkload,
} from './performance-profile.mjs';

export {
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_WARMUP_COUNT,
} from './performance-profile.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

export const createPerformancePlan = ({ warmupCount, sampleCount }) => {
  const workloads = WORKLOADS.map(workload => ({
    ...workload,
    budgets: { ...workload.budgets },
    rgbSha256: sha256(createRgbWorkload(workload)),
  }));
  const sourceSha256 = sha256(JSON.stringify({
    profileVersion: PERFORMANCE_PROFILE_VERSION,
    pattern: PERFORMANCE_PATTERN,
    workloads: workloads.map(({ id, width, height, pixels, rgbSha256 }) => ({
      id,
      width,
      height,
      pixels,
      rgbSha256,
    })),
  }));

  return {
    profileVersion: PERFORMANCE_PROFILE_VERSION,
    mode: 'plan',
    algorithm: 'pdq-v1',
    pattern: PERFORMANCE_PATTERN,
    warmupCount,
    sampleCount,
    percentileMethod: 'nearest-rank',
    implementations: ['typescript', 'same-source-wasm'],
    adapterFixture: { ...ADAPTER_FIXTURE },
    runtimes: {
      node: true,
      browsers: ['chromium', 'firefox', 'webkit'],
    },
    workloads,
    wasmBudgets: { ...WASM_BUDGETS },
    wasmDecision: { ...WASM_DECISION },
    sourceSha256,
  };
};
