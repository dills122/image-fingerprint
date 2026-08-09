#!/usr/bin/env node

import { resolve } from 'node:path';
import { WORKLOADS, createRgbWorkload } from './performance-profile.mjs';

const parseArguments = arguments_ => {
  const options = { mode: undefined, workloadId: undefined, encoded: undefined };
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!['--mode', '--workload', '--encoded'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
    seen.add(argument);
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    if (argument === '--mode') options.mode = value;
    if (argument === '--workload') options.workloadId = value;
    if (argument === '--encoded') options.encoded = resolve(value);
  }
  if (!['core', 'adapter'].includes(options.mode)) {
    throw new Error('--mode must be core or adapter');
  }
  const workload = WORKLOADS.find(candidate => candidate.id === options.workloadId);
  if (workload === undefined) throw new Error('A known --workload is required');
  if (options.mode === 'adapter' && options.encoded === undefined) {
    throw new Error('--encoded is required for adapter memory measurement');
  }
  if (options.mode === 'core' && options.encoded !== undefined) {
    throw new Error('--encoded is only valid for adapter memory measurement');
  }
  return { ...options, workload };
};

const toMiB = bytes => Number((bytes / 1024 / 1024).toFixed(3));

try {
  const options = parseArguments(process.argv.slice(2));
  let operation;
  if (options.mode === 'core') {
    const { fingerprintPixels } = await import('../../lib/core/index.js');
    const rgb = createRgbWorkload(options.workload);
    operation = () => fingerprintPixels({
      format: 'rgb8',
      width: options.workload.width,
      height: options.workload.height,
      data: rgb,
    }, { algorithm: 'pdq-v1' });
  } else {
    const { fingerprintImage } = await import('../../lib/node.js');
    operation = () => fingerprintImage(options.encoded, { algorithm: 'pdq-v1' });
  }

  globalThis.gc?.();
  await new Promise(resolvePromise => setImmediate(resolvePromise));
  const baselineRssBytes = process.memoryUsage().rss;
  const baselineMaxRssBytes = process.resourceUsage().maxRSS * 1024;
  const result = await operation();
  const finalRssBytes = process.memoryUsage().rss;
  const maxRssBytes = process.resourceUsage().maxRSS * 1024;
  process.stdout.write(`${JSON.stringify({
    mode: options.mode,
    workload: options.workload.id,
    hash: result.hash,
    quality: result.quality,
    baselineRssMiB: toMiB(baselineRssBytes),
    baselineMaxRssMiB: toMiB(baselineMaxRssBytes),
    finalRssMiB: toMiB(finalRssBytes),
    maxRssMiB: toMiB(maxRssBytes),
    incrementalPeakRssMiB: toMiB(Math.max(0, maxRssBytes - baselineRssBytes)),
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
