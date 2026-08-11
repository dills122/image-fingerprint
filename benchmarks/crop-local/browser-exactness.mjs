import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';

const PLAN = {
  profileVersion: 1,
  browsers: ['chromium', 'firefox', 'webkit'],
  contexts: ['main-thread', 'module-worker'],
  comparisonReference: 'node',
  fingerprintProfiles: [
    'crop-local-multiscale-binary-v0',
    'crop-local-item-color-v0',
    'crop-local-item-color-packed-v0',
  ],
};

const createNodeFixture = () => {
  const width = 144;
  const height = 112;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const checker = ((x >> 3) ^ (y >> 3)) & 1;
      const ring = Math.abs((x - 72) ** 2 + (y - 56) ** 2 - 35 ** 2) < 180;
      const index = (y * width + x) * 4;
      data[index] = (x * 11 + y * 3 + checker * 71) & 255;
      data[index + 1] = (x * 2 + y * 13 + (ring ? 89 : 0)) & 255;
      data[index + 2] = (x * y + checker * 43 + (ring ? 127 : 0)) & 255;
      data[index + 3] = (x + y) % 17 === 0 ? 143 : 255;
    }
  }
  return { format: 'rgba8', width, height, data };
};

const run = async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'crop-local-browser-'));
  let server;
  try {
    await build({
      configFile: false,
      build: {
        emptyOutDir: true,
        lib: {
          entry: resolve('benchmarks/crop-local/browser-exactness-entry.ts'),
          formats: ['es'],
          fileName: () => 'entry.mjs',
        },
        minify: false,
        outDir: temporary,
      },
      logLevel: 'silent',
    });
    await writeFile(join(temporary, 'worker.mjs'), `
      import { runCropLocalExactnessFixture } from './entry.mjs';
      postMessage(runCropLocalExactnessFixture());
    `);
    await writeFile(join(temporary, 'index.html'), `
      <script type="module">
        import { runCropLocalExactnessFixture } from './entry.mjs';
        const worker = new Worker('./worker.mjs', { type: 'module' });
        worker.onmessage = ({ data }) => {
          document.body.textContent = JSON.stringify({ main: runCropLocalExactnessFixture(), worker: data });
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
      fingerprintCropLocalExperiment,
      fingerprintCropLocalItemExperiment,
      packCropLocalItemExperimentFingerprint,
    } = require('../../lib/core/algorithms/crop-local/index.js');
    const fixture = createNodeFixture();
    const options = {
      maximumDimension: 256,
      maximumFeatures: 128,
      verificationMaximumDimension: 96,
      colorVerificationMaximumDimension: 64,
    };
    const itemColor = fingerprintCropLocalItemExperiment(fixture, options);
    const expected = {
      local: fingerprintCropLocalExperiment(fixture, options),
      itemColor,
      itemColorPacked: packCropLocalItemExperimentFingerprint(itemColor),
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
    const serialized = JSON.stringify(expected);
    return {
      ...PLAN,
      node: process.version,
      combinedFingerprintSha256: createHash('sha256').update(serialized).digest('hex'),
      serializedBytes: Buffer.byteLength(serialized),
      results,
    };
  } finally {
    if (server !== undefined) await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(temporary, { recursive: true, force: true });
  }
};

try {
  if (process.argv.length === 3 && process.argv[2] === '--plan-only') {
    process.stdout.write(`${JSON.stringify(PLAN)}\n`);
  } else if (process.argv.length === 4 && process.argv[2] === '--output') {
    const output = resolve(process.argv[3]);
    const result = await run();
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ output, ...result })}\n`);
  } else if (process.argv.length === 2) {
    process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`);
  } else {
    throw new Error('Usage: node benchmarks/crop-local/browser-exactness.mjs [--plan-only|--output FILE]');
  }
} catch (error) {
  process.stderr.write(`crop-local browser exactness: ${error.message}\n`);
  process.exitCode = 2;
}
