#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
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
import { decideWasmAdvancement } from './performance-metrics.mjs';

const BROWSERS = ['chromium', 'firefox', 'webkit'];
const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const benchmarkRoot = dirname(fileURLToPath(import.meta.url));

const parseArguments = arguments_ => {
  const options = {
    planOnly: false,
    run: false,
    warmupCount: DEFAULT_WARMUP_COUNT,
    sampleCount: DEFAULT_SAMPLE_COUNT,
    output: undefined,
    wasm: undefined,
    browser: undefined,
    workloadId: undefined,
    trace: false,
    quiet: false,
  };
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (seen.has(argument)) throw new Error(`${argument} may only be supplied once`);
    seen.add(argument);
    if (argument === '--plan-only') {
      options.planOnly = true;
      continue;
    }
    if (argument === '--run') {
      options.run = true;
      continue;
    }
    if (argument === '--trace') {
      options.trace = true;
      continue;
    }
    if (argument === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (['--warmups', '--samples', '--output', '--wasm', '--browser', '--workload'].includes(argument)) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === '--warmups' || argument === '--samples') {
        if (!/^(0|[1-9][0-9]*)$/.test(value)) {
          throw new Error(`${argument} requires an integer`);
        }
        const parsed = Number(value);
        const minimum = argument === '--warmups' ? 0 : 5;
        const maximum = argument === '--warmups' ? 20 : 100;
        if (parsed < minimum || parsed > maximum) {
          throw new Error(`${argument} must be between ${minimum} and ${maximum}`);
        }
        options[argument === '--warmups' ? 'warmupCount' : 'sampleCount'] = parsed;
      }
      if (argument === '--output') options.output = resolve(value);
      if (argument === '--wasm') options.wasm = resolve(value);
      if (argument === '--browser') options.browser = value;
      if (argument === '--workload') options.workloadId = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.planOnly === options.run) {
    throw new Error('Choose exactly one of --plan-only or --run');
  }
  if (options.run && options.wasm === undefined) throw new Error('--wasm is required with --run');
  if (options.quiet && options.output === undefined) throw new Error('--quiet requires --output');
  if (options.browser !== undefined && !BROWSERS.includes(options.browser)) {
    throw new Error(`--browser must be one of ${BROWSERS.join(', ')}`);
  }
  if (options.workloadId !== undefined
    && !WORKLOADS.some(workload => workload.id === options.workloadId)) {
    throw new Error(`Unknown workload: ${options.workloadId}`);
  }
  return options;
};

const commonHeaders = {
  'Cache-Control': 'no-store',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

const confinedFile = (root, relativePath) => {
  const prefix = `${normalize(root)}${sep}`;
  const file = normalize(resolve(root, relativePath));
  if (!file.startsWith(prefix)) throw new Error('Requested path escaped its served root');
  return file;
};

const startServer = async (fixtures, wasmBytes) => {
  const libRoot = join(repositoryRoot, 'lib');
  const pagePath = join(benchmarkRoot, 'browser-performance.html');
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname === '/pdq-performance.wasm') {
        response.writeHead(200, {
          ...commonHeaders,
          'Content-Length': wasmBytes.byteLength,
          'Content-Type': contentTypes['.wasm'],
        }).end(wasmBytes);
        return;
      }
      if (pathname.startsWith('/fixtures/') && pathname.endsWith('.png')) {
        const id = decodeURIComponent(pathname.slice('/fixtures/'.length, -'.png'.length));
        const bytes = fixtures.get(id);
        if (bytes === undefined) {
          response.writeHead(404, commonHeaders).end('Not found');
          return;
        }
        response.writeHead(200, {
          ...commonHeaders,
          'Content-Length': bytes.byteLength,
          'Content-Type': contentTypes['.png'],
        }).end(bytes);
        return;
      }

      let file;
      if (pathname === '/') file = pagePath;
      if (pathname.startsWith('/lib/')) {
        file = confinedFile(libRoot, decodeURIComponent(pathname.slice('/lib/'.length)));
      }
      if (pathname.startsWith('/benchmarks/pdq/')) {
        file = confinedFile(
          benchmarkRoot,
          decodeURIComponent(pathname.slice('/benchmarks/pdq/'.length)),
        );
      }
      if (file === undefined) {
        response.writeHead(404, commonHeaders).end('Not found');
        return;
      }
      const contents = await readFile(file);
      response.writeHead(200, {
        ...commonHeaders,
        'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      }).end(contents);
    } catch {
      response.writeHead(404, commonHeaders).end('Not found');
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Browser benchmark server did not expose a TCP port');
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolvePromise, reject) => {
      server.close(error => error === undefined ? resolvePromise() : reject(error));
    }),
  };
};

const createFixtures = async () => {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const fixtures = new Map();
  for (const workload of WORKLOADS) {
    const rgb = createRgbWorkload(workload);
    const encoded = await sharp(rgb, {
      raw: { width: workload.width, height: workload.height, channels: 3 },
    }).png({ compressionLevel: ADAPTER_FIXTURE.compressionLevel }).toBuffer();
    if (encoded.byteLength > ADAPTER_FIXTURE.maximumEncodedBytes) {
      throw new Error(`${workload.id} encoded fixture exceeds the public adapter byte limit`);
    }
    fixtures.set(workload.id, encoded);
  }
  return { fixtures, versions: sharp.versions };
};

const collect = async options => {
  const playwright = await import('playwright');
  const wasmBytes = await readFile(options.wasm);
  const fixtureData = await createFixtures();
  const server = await startServer(fixtureData.fixtures, wasmBytes);
  const browsers = options.browser === undefined ? BROWSERS : [options.browser];
  const browserResults = [];
  try {
    for (const browserName of browsers) {
      const browser = await playwright[browserName].launch({ headless: true });
      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(15 * 60 * 1000);
        const errors = [];
        page.on('console', message => {
          if (options.trace) process.stderr.write(`${browserName} ${message.type()}: ${message.text()}\n`);
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`page: ${error.message}`));
        const response = await page.goto(server.url, { waitUntil: 'load' });
        if (response?.ok() !== true) throw new Error(`${browserName} did not load the harness`);
        await page.waitForFunction(() => typeof globalThis.runPdqBrowserPerformance === 'function');
        const result = await page.evaluate(configuration => (
          globalThis.runPdqBrowserPerformance(configuration)
        ), {
          warmupCount: options.warmupCount,
          sampleCount: options.sampleCount,
          wasmUrl: '/pdq-performance.wasm',
          workloadId: options.workloadId,
          trace: options.trace,
        });
        if (errors.length !== 0) {
          throw new Error(`${browserName} emitted page errors: ${errors.join('; ')}`);
        }
        const complete = result.results.length === WORKLOADS.length;
        const decision = complete
          ? decideWasmAdvancement({
            exactConformance: result.results.every(
              item => item.sameSourceWasmCore.exactConformance,
            ),
            typescriptCoreP95Ms: Object.fromEntries(
              result.results.map(item => [item.id, item.typescriptCore.summary.p95Ms]),
            ),
            wasmCoreP95Ms: Object.fromEntries(
              result.results.map(item => [item.id, item.sameSourceWasmCore.summary.p95Ms]),
            ),
          })
          : { advance: null, reason: 'requires-all-workloads' };
        browserResults.push({
          name: browserName,
          version: browser.version(),
          ...result,
          wasmDecision: decision,
        });
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  return {
    profileVersion: 1,
    mode: 'measure',
    runtime: 'browser',
    plan: createPerformancePlan(options),
    environment: {
      os: `${platform()} ${release()}`,
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      nodeHarness: process.version,
      sharp: fixtureData.versions.sharp,
      libvips: fixtureData.versions.vips,
    },
    sameSourceWasm: {
      file: basename(options.wasm),
      rawBytes: wasmBytes.byteLength,
      gzipBytes: gzipSync(wasmBytes, { level: 9 }).byteLength,
      artifactBudget: {
        maximumRawBytes: WASM_BUDGETS.rawBytes,
        maximumGzipBytes: WASM_BUDGETS.gzipBytes,
        passed: wasmBytes.byteLength <= WASM_BUDGETS.rawBytes
          && gzipSync(wasmBytes, { level: 9 }).byteLength <= WASM_BUDGETS.gzipBytes,
      },
    },
    browsers: browserResults,
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const report = options.planOnly ? createPerformancePlan(options) : await collect(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output !== undefined) await writeFile(options.output, serialized, 'utf8');
  if (!options.quiet) process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
