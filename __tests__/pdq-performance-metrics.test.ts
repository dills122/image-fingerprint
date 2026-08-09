import { describe, expect, it } from 'vitest';
import {
  decideWasmAdvancement,
  nearestRank,
  summarizeTimings,
} from '../benchmarks/pdq/performance-metrics.mjs';
import {
  createPdqWasmHasher,
  formatPdqWasmHash,
} from '../benchmarks/pdq/performance-wasm.mjs';

describe('PDQ performance metrics', () => {
  it('formats the WASM oracle words in canonical PDQ order', () => {
    const words = Uint16Array.from([
      0x0000, 0x1111, 0x2222, 0x3333,
      0x4444, 0x5555, 0x6666, 0x7777,
      0x8888, 0x9999, 0xaaaa, 0xbbbb,
      0xcccc, 0xdddd, 0xeeee, 0xffff,
    ]);

    expect(formatPdqWasmHash(words)).toBe(
      'ffffeeeeddddccccbbbbaaaa9999888877776666555544443333222211110000',
    );
  });

  it('validates WASM hasher dimensions before touching module exports', () => {
    expect(() => createPdqWasmHasher(
      { exports: {} },
      new Uint8Array(),
      0,
      5,
    )).toThrow('dimensions');
  });

  it('uses nearest-rank percentiles without mutating samples', () => {
    const samples = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];

    expect(nearestRank(samples, 0.5)).toBe(5);
    expect(nearestRank(samples, 0.95)).toBe(10);
    expect(samples).toEqual([10, 1, 9, 2, 8, 3, 7, 4, 6, 5]);
  });

  it('summarizes retained samples and pixel throughput', () => {
    expect(summarizeTimings([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1_000)).toEqual({
      count: 10,
      minMs: 1,
      p50Ms: 5,
      p95Ms: 10,
      maxMs: 10,
      meanMs: 5.5,
      p50MegapixelsPerSecond: 0.2,
      p95MegapixelsPerSecond: 0.1,
    });
  });

  it.each([
    [[], 1_000],
    [[1], 0],
    [[0], 1_000],
    [[1, Number.NaN], 1_000],
    [[-1], 1_000],
  ])('rejects invalid timing input %#', (samples, pixels) => {
    expect(() => summarizeTimings(samples, pixels)).toThrow();
  });

  it('advances WASM only when exact and justified by budgets or speedup', () => {
    expect(decideWasmAdvancement({
      exactConformance: true,
      typescriptCoreP95Ms: {
        'region-0.25mp': 10,
        'scan-2mp': 80,
        'high-resolution-12mp': 400,
      },
      wasmCoreP95Ms: {
        'scan-2mp': 35,
        'high-resolution-12mp': 180,
      },
    })).toEqual({
      advance: true,
      reason: 'wasm-at-least-2x-faster-at-2mp-and-12mp',
    });

    expect(decideWasmAdvancement({
      exactConformance: true,
      typescriptCoreP95Ms: {
        'region-0.25mp': 21,
        'scan-2mp': 80,
        'high-resolution-12mp': 400,
      },
      wasmCoreP95Ms: {
        'scan-2mp': 70,
        'high-resolution-12mp': 350,
      },
    })).toEqual({
      advance: true,
      reason: 'typescript-missed-core-budget',
    });
  });

  it('rejects WASM advancement on mismatch or insufficient benefit', () => {
    expect(decideWasmAdvancement({
      exactConformance: false,
      typescriptCoreP95Ms: {
        'region-0.25mp': 21,
        'scan-2mp': 120,
        'high-resolution-12mp': 600,
      },
      wasmCoreP95Ms: {
        'scan-2mp': 20,
        'high-resolution-12mp': 50,
      },
    })).toEqual({ advance: false, reason: 'wasm-conformance-failed' });

    expect(decideWasmAdvancement({
      exactConformance: true,
      typescriptCoreP95Ms: {
        'region-0.25mp': 10,
        'scan-2mp': 80,
        'high-resolution-12mp': 400,
      },
      wasmCoreP95Ms: {
        'scan-2mp': 50,
        'high-resolution-12mp': 210,
      },
    })).toEqual({ advance: false, reason: 'insufficient-measured-benefit' });
  });

  it('rejects incomplete or non-positive WASM decision inputs', () => {
    expect(() => decideWasmAdvancement({
      exactConformance: true,
      typescriptCoreP95Ms: {
        'region-0.25mp': 10,
        'scan-2mp': 80,
        'high-resolution-12mp': 400,
      },
      wasmCoreP95Ms: {
        'scan-2mp': 0,
        'high-resolution-12mp': 200,
      },
    })).toThrow('positive finite');
  });
});
