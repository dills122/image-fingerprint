#!/usr/bin/env node

import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_WARMUP_COUNT,
  createPerformancePlan,
} from './performance-support.mjs';
import {
  ADAPTER_FIXTURE,
  WASM_BUDGETS,
  WORKLOADS,
  createRgbWorkload,
} from './performance-profile.mjs';
import {
  decideWasmAdvancement,
  summarizeDurations,
  summarizeTimings,
} from './performance-metrics.mjs';
import { createPdqWasmHasher, instantiatePdqWasm } from './performance-wasm.mjs';

const parseBoundedInteger = (name, value, minimum, maximum) => {
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? '')) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
};

const parseArguments = arguments_ => {
  const values = {
    planOnly: false,
    measureNode: false,
    warmupCount: DEFAULT_WARMUP_COUNT,
    sampleCount: DEFAULT_SAMPLE_COUNT,
    output: undefined,
    workloadId: undefined,
    wasm: undefined,
    quiet: false,
  };
  const seen = new Set();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--plan-only') {
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
      seen.add(argument);
      values.planOnly = true;
      continue;
    }
    if (argument === '--node') {
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
      seen.add(argument);
      values.measureNode = true;
      continue;
    }
    if (argument === '--quiet') {
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
      seen.add(argument);
      values.quiet = true;
      continue;
    }
    if (argument === '--warmups' || argument === '--samples') {
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
      seen.add(argument);
      const next = arguments_[index + 1];
      if (next === undefined) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === '--warmups') {
        values.warmupCount = parseBoundedInteger(argument, next, 0, 20);
      } else {
        values.sampleCount = parseBoundedInteger(argument, next, 5, 100);
      }
      continue;
    }
    if (argument === '--output' || argument === '--workload' || argument === '--wasm') {
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
      seen.add(argument);
      const next = arguments_[index + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === '--output') values.output = resolve(next);
      if (argument === '--workload') values.workloadId = next;
      if (argument === '--wasm') values.wasm = resolve(next);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (values.planOnly === values.measureNode) {
    throw new Error('Choose exactly one of --plan-only or --node');
  }
  if (values.measureNode && values.wasm === undefined) {
    throw new Error('--wasm is required with --node');
  }
  if (values.quiet && values.output === undefined) {
    throw new Error('--quiet requires --output');
  }
  if (values.workloadId !== undefined
    && !WORKLOADS.some(workload => workload.id === values.workloadId)) {
    throw new Error(`Unknown workload: ${values.workloadId}`);
  }

  return values;
};

const measureSync = (operation, warmupCount, sampleCount) => {
  let expected;
  for (let index = 0; index < warmupCount; index += 1) {
    expected = operation();
  }

  const samplesMs = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    const result = operation();
    samplesMs.push(performance.now() - startedAt);
    expected ??= result;
    if (result.hash !== expected.hash || result.quality !== expected.quality) {
      throw new Error('Fingerprint changed between retained samples');
    }
  }
  return { fingerprint: expected, samplesMs };
};

const measureAsync = async (operation, warmupCount, sampleCount, resultKey) => {
  let expected;
  for (let index = 0; index < warmupCount; index += 1) {
    expected = await operation();
  }

  const samplesMs = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    const result = await operation();
    samplesMs.push(performance.now() - startedAt);
    expected ??= result;
    if (resultKey !== undefined && result[resultKey] !== expected[resultKey]) {
      throw new Error(`${resultKey} changed between retained samples`);
    }
  }
  return { value: expected, samplesMs };
};

const measurement = (samplesMs, pixels, budgetMs) => {
  const summary = summarizeTimings(samplesMs, pixels);
  return {
    samplesMs: samplesMs.map(sample => Number(sample.toFixed(6))),
    summary,
    budget: {
      maximumP95Ms: budgetMs,
      passed: summary.p95Ms <= budgetMs,
    },
  };
};

const memoryChild = fileURLToPath(new URL('./performance-memory-child.mjs', import.meta.url));

const measureMemory = (mode, workload, encodedPath) => {
  const arguments_ = [
    '--expose-gc',
    memoryChild,
    '--mode',
    mode,
    '--workload',
    workload.id,
  ];
  if (encodedPath !== undefined) arguments_.push('--encoded', encodedPath);
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Memory child failed for ${workload.id}/${mode}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
};

const measureNode = async options => {
  const [{ fingerprintPixels }, { decodeImage, fingerprintImage }, sharpModule] = await Promise.all([
    import('../../lib/core/index.js'),
    import('../../lib/node.js'),
    import('sharp'),
  ]);
  const sharp = sharpModule.default;
  const selectedWorkloads = options.workloadId === undefined
    ? WORKLOADS
    : WORKLOADS.filter(workload => workload.id === options.workloadId);
  const results = [];
  let wasm;
  if (options.wasm !== undefined) {
    const bytes = await readFile(options.wasm);
    const compileStartedAt = performance.now();
    const compiledModule = await WebAssembly.compile(bytes);
    const compileMs = performance.now() - compileStartedAt;
    const initialization = await measureAsync(
      () => instantiatePdqWasm(compiledModule),
      options.warmupCount,
      options.sampleCount,
    );
    wasm = {
      bytes,
      compiledModule,
      instance: initialization.value,
      metadata: {
        file: basename(options.wasm),
        rawBytes: bytes.byteLength,
        gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
        artifactBudget: {
          maximumRawBytes: WASM_BUDGETS.rawBytes,
          maximumGzipBytes: WASM_BUDGETS.gzipBytes,
          passed: bytes.byteLength <= WASM_BUDGETS.rawBytes
            && gzipSync(bytes, { level: 9 }).byteLength <= WASM_BUDGETS.gzipBytes,
        },
        compileMs: Number(compileMs.toFixed(6)),
        warmInitialization: {
          samplesMs: initialization.samplesMs.map(sample => Number(sample.toFixed(6))),
          summary: summarizeDurations(initialization.samplesMs),
          budget: {
            maximumP95Ms: WASM_BUDGETS.warmInitializationP95Ms,
            passed: summarizeDurations(initialization.samplesMs).p95Ms
              <= WASM_BUDGETS.warmInitializationP95Ms,
          },
        },
      },
    };
  }

  for (const workload of selectedWorkloads) {
    const rgb = createRgbWorkload(workload);
    const pixels = {
      format: 'rgb8',
      width: workload.width,
      height: workload.height,
      data: rgb,
    };
    const core = measureSync(
      () => fingerprintPixels(pixels, { algorithm: 'pdq-v1' }),
      options.warmupCount,
      options.sampleCount,
    );
    let wasmCore;
    if (wasm !== undefined) {
      const hasher = createPdqWasmHasher(
        wasm.instance,
        rgb,
        workload.width,
        workload.height,
      );
      try {
        const conformant = hasher.hash();
        if (conformant.hash !== core.fingerprint.hash
          || conformant.quality !== core.fingerprint.quality) {
          throw new Error(`${workload.id} same-source WASM result was not exactly conformant`);
        }
        const timings = measureSync(
          () => hasher.hash(),
          options.warmupCount,
          options.sampleCount,
        );
        wasmCore = {
          ...measurement(timings.samplesMs, workload.pixels, workload.budgets.coreP95Ms),
          linearMemoryBytes: hasher.memoryBytes(),
          exactConformance: true,
        };
      } finally {
        hasher.dispose();
      }
    }

    const encoded = await sharp(rgb, {
      raw: { width: workload.width, height: workload.height, channels: 3 },
    }).png({ compressionLevel: ADAPTER_FIXTURE.compressionLevel }).toBuffer();
    if (encoded.byteLength > ADAPTER_FIXTURE.maximumEncodedBytes) {
      throw new Error(`${workload.id} encoded fixture exceeds the public adapter byte limit`);
    }
    const memoryDirectory = mkdtempSync(join(tmpdir(), 'image-hash-pdq-memory-'));
    const encodedPath = join(memoryDirectory, `${workload.id}.png`);
    writeFileSync(encodedPath, encoded);
    let memory;
    try {
      memory = {
        core: measureMemory('core', workload),
        adapter: measureMemory('adapter', workload, encodedPath),
      };
    } finally {
      rmSync(memoryDirectory, { recursive: true, force: true });
    }
    const decode = await measureAsync(
      () => decodeImage(encoded),
      options.warmupCount,
      options.sampleCount,
    );
    const decodedPixels = decode.value;
    const decodedCore = measureSync(
      () => fingerprintPixels(decodedPixels, { algorithm: 'pdq-v1' }),
      options.warmupCount,
      options.sampleCount,
    );
    const adapter = await measureAsync(
      () => fingerprintImage(encoded, { algorithm: 'pdq-v1' }),
      options.warmupCount,
      options.sampleCount,
      'hash',
    );

    if (core.fingerprint.hash !== decodedCore.fingerprint.hash
      || core.fingerprint.hash !== adapter.value.hash
      || core.fingerprint.quality !== decodedCore.fingerprint.quality
      || core.fingerprint.quality !== adapter.value.quality) {
      throw new Error(`${workload.id} PNG adapter path changed the normalized fingerprint`);
    }
    if (memory.core.hash !== core.fingerprint.hash
      || memory.adapter.hash !== core.fingerprint.hash
      || memory.core.quality !== core.fingerprint.quality
      || memory.adapter.quality !== core.fingerprint.quality) {
      throw new Error(`${workload.id} isolated memory child changed the fingerprint`);
    }

    results.push({
      id: workload.id,
      width: workload.width,
      height: workload.height,
      pixels: workload.pixels,
      encodedPngBytes: encoded.byteLength,
      fingerprint: core.fingerprint,
      memory: {
        core: {
          ...memory.core,
          ...(workload.budgets.nodeCoreIncrementalPeakRssMiB === undefined ? {} : {
            budget: {
              maximumIncrementalPeakRssMiB:
                workload.budgets.nodeCoreIncrementalPeakRssMiB,
              passed: memory.core.incrementalPeakRssMiB
                <= workload.budgets.nodeCoreIncrementalPeakRssMiB,
            },
          }),
        },
        adapter: {
          ...memory.adapter,
          ...(workload.budgets.nodeAdapterIncrementalPeakRssMiB === undefined ? {} : {
            budget: {
              maximumIncrementalPeakRssMiB:
                workload.budgets.nodeAdapterIncrementalPeakRssMiB,
              passed: memory.adapter.incrementalPeakRssMiB
                <= workload.budgets.nodeAdapterIncrementalPeakRssMiB,
            },
          }),
        },
      },
      typescriptCore: measurement(
        core.samplesMs,
        workload.pixels,
        workload.budgets.coreP95Ms,
      ),
      ...(wasmCore === undefined ? {} : { sameSourceWasmCore: wasmCore }),
      adapterDecode: {
        samplesMs: decode.samplesMs.map(sample => Number(sample.toFixed(6))),
        summary: summarizeTimings(decode.samplesMs, workload.pixels),
      },
      adapterHashDecoded: measurement(
        decodedCore.samplesMs,
        workload.pixels,
        workload.budgets.coreP95Ms,
      ),
      adapterTotal: measurement(
        adapter.samplesMs,
        workload.pixels,
        workload.budgets.adapterTotalP95Ms,
      ),
    });
  }

  const completeWasmComparison = wasm !== undefined && selectedWorkloads.length === WORKLOADS.length;
  const wasmDecision = completeWasmComparison
    ? decideWasmAdvancement({
      exactConformance: results.every(result => result.sameSourceWasmCore.exactConformance),
      typescriptCoreP95Ms: Object.fromEntries(
        results.map(result => [result.id, result.typescriptCore.summary.p95Ms]),
      ),
      wasmCoreP95Ms: Object.fromEntries(
        results.map(result => [result.id, result.sameSourceWasmCore.summary.p95Ms]),
      ),
    })
    : undefined;

  return {
    profileVersion: 1,
    mode: 'measure',
    runtime: 'node',
    plan: createPerformancePlan(options),
    environment: {
      os: `${platform()} ${release()}`,
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      totalMemoryMiB: Math.round(totalmem() / 1024 / 1024),
      node: process.version,
      v8: process.versions.v8,
      sharp: sharp.versions.sharp,
      libvips: sharp.versions.vips,
    },
    ...(wasm === undefined ? {} : {
      sameSourceWasm: {
        ...wasm.metadata,
        exactConformance: true,
        decision: wasmDecision ?? {
          advance: null,
          reason: 'requires-all-workloads',
        },
      },
    }),
    results,
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const report = options.planOnly
    ? createPerformancePlan(options)
    : await measureNode(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output !== undefined) await writeFile(options.output, serialized, 'utf8');
  if (!options.quiet) process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
