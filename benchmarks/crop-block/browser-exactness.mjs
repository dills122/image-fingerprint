import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import { chromium, firefox, webkit } from 'playwright';

const PLAN = {
  profileVersion: 1,
  browsers: ['chromium', 'firefox', 'webkit'],
  contexts: ['main-thread', 'module-worker'],
  preprocessors: ['bilinear-gaussian', 'area-box'],
  regionAlgorithms: ['blockhash-v1', 'pdq-v1'],
};

const createNodeFixture = () => {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x < 32) === (y < 32) ? 230 : 25;
      data.set([value, value, 255 - value, (x + y) % 11 === 0 ? 127 : 255], (y * width + x) * 4);
    }
  }
  return { format: 'rgba8', width, height, data };
};

const run = async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'crop-block-browser-'));
  let server;
  try {
    await build({
      configFile: false,
      build: {
        emptyOutDir: true,
        lib: {
          entry: resolve('benchmarks/crop-block/browser-exactness-entry.ts'),
          formats: ['es'],
          fileName: () => 'entry.mjs',
        },
        minify: false,
        outDir: temporary,
      },
      logLevel: 'silent',
    });
    await writeFile(join(temporary, 'worker.mjs'), `
      import { runCropBlockExactnessFixture } from './entry.mjs';
      postMessage(runCropBlockExactnessFixture());
    `);
    await writeFile(join(temporary, 'index.html'), `
      <script type="module">
        import { runCropBlockExactnessFixture } from './entry.mjs';
        const worker = new Worker('./worker.mjs', { type: 'module' });
        worker.onmessage = ({ data }) => {
          document.body.textContent = JSON.stringify({ main: runCropBlockExactnessFixture(), worker: data });
          document.body.dataset.status = 'done';
        };
      </script>
    `);
    server = createServer(async (request, response) => {
      const name = request.url === '/' ? 'index.html' : request.url.replace(/^\//, '');
      try {
        const contents = await readFile(join(temporary, name));
        response.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html' : 'text/javascript' });
        response.end(contents);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolvePromise);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('server address unavailable');

    const require = createRequire(import.meta.url);
    const {
      fingerprintCropBlockExperiment,
      fingerprintCropBlockV2Experiment,
    } = require('../../lib/core/algorithms/crop-block/index.js');
    const source = createNodeFixture();
    const expected = {
      v1: PLAN.preprocessors.flatMap((preprocessing) => (
        PLAN.regionAlgorithms.map((regionAlgorithm) => fingerprintCropBlockExperiment(source, {
          preprocessing,
          gridSize: 32,
          minimumArea: 20,
          maximumSegments: 16,
          fallback: 'empty',
          regionAlgorithm,
        }))
      )),
      v2: fingerprintCropBlockV2Experiment(source, {
        preprocessing: 'area-box',
        gridSize: 32,
        minimumArea: 20,
        maximumSegments: 16,
        fallback: 'empty',
        minimumEntropyMilliBits: 1000,
        minimumEdgeDensityPermille: 10,
        minimumLuminanceRange: 32,
        deduplicateChildHashes: true,
      }),
    };
    const results = [];
    for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.locator('body[data-status="done"]').waitFor({ timeout: 30_000 });
        const result = JSON.parse(await page.locator('body').textContent());
        assert.deepEqual(result.main, expected);
        assert.deepEqual(result.worker, expected);
        results.push({ name, version: browser.version(), exact: true });
      } finally {
        await browser.close();
      }
    }
    return { ...PLAN, node: process.version, results };
  } finally {
    if (server !== undefined) await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(temporary, { recursive: true, force: true });
  }
};

try {
  if (process.argv.length === 3 && process.argv[2] === '--plan-only') {
    process.stdout.write(`${JSON.stringify(PLAN)}\n`);
  } else if (process.argv.length === 2) {
    process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`);
  } else {
    throw new Error('Usage: node benchmarks/crop-block/browser-exactness.mjs [--plan-only]');
  }
} catch (error) {
  process.stderr.write(`crop-block browser exactness: ${error.message}\n`);
  process.exitCode = 2;
}
