import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPackedConsumer,
  repositoryRoot,
} from './packed-consumer-utils.mjs';
import {
  createCropLocalBrowserFixtures,
  runCropLocalBrowserFixtures,
} from './browser-smoke-crop-local-fixtures.mjs';

const PLAN = {
  profileVersion: 2,
  packageSource: 'packed-tarball',
  browsers: ['chromium', 'firefox', 'webkit'],
  contexts: ['main-thread', 'module-worker'],
  pixelFormats: ['gray8', 'rgb8', 'rgba8'],
  adapterSources: ['ImageData', 'Blob', 'File'],
  experimentalProfiles: [
    'crop-local-item-color-v0',
    'crop-local-item-color-packed-v0',
  ],
  cropLocalFixtureClasses: createCropLocalBrowserFixtures().map(({ name }) => name),
};

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') {
    return { planOnly: true };
  }
  if (arguments_.length === 0) {
    return { planOnly: false };
  }
  throw new Error('Usage: node scripts/browser-engine-smoke.mjs [--plan-only]');
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const startServer = async (root) => {
  const rootPrefix = `${normalize(root)}${sep}`;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const relativePath = decodeURIComponent(
        pathname === '/' ? '/scripts/browser-smoke.html' : pathname,
      ).replace(/^\/+/, '');
      const file = normalize(join(root, relativePath));
      if (!file.startsWith(rootPrefix)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const contents = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      });
      response.end(contents);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('loopback server did not expose a TCP port');
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    }),
  };
};

const runBrowser = async (name, browserType, url, expectedCropLocal) => {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const requests = new Set();
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('request', (request) => requests.add(new URL(request.url()).pathname));

    const response = await page.goto(url, { waitUntil: 'load' });
    assert.equal(response?.ok(), true, `${name} did not load the smoke page`);
    await page.locator('body[data-status="passed"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('body').getAttribute('data-main-status'), 'passed');
    assert.equal(await page.locator('body').getAttribute('data-worker-status'), 'passed');
    const result = JSON.parse(await page.locator('body').textContent());
    assert.deepEqual(result.mainThread, result.moduleWorker);
    assert.deepEqual(Object.keys(result.mainThread.rawPixels), PLAN.pixelFormats);
    assert.deepEqual(result.mainThread.adapters.blob, result.mainThread.adapters.file);
    assert.deepEqual(result.mainThread.adapters.blob, result.mainThread.adapters.decodedPixels);
    assert.deepEqual(result.mainThread.adapters.imageData, result.mainThread.rawPixels.rgba8);
    assert.deepEqual(result.mainThread.cropLocal, expectedCropLocal);
    assert.deepEqual(result.moduleWorker.cropLocal, expectedCropLocal);
    assert.ok(result.mainThread.adapters.width >= 5);
    assert.ok(result.mainThread.adapters.height >= 5);
    assert.deepEqual(errors, []);
    assert.equal(requests.has('/scripts/browser-smoke-worker.mjs'), true);
    assert.equal(requests.has('/scripts/browser-smoke-crop-local-fixtures.mjs'), true);
    assert.equal(requests.has('/scripts/Example.png'), true);
    assert.equal(
      requests.has('/node_modules/image-fingerprint/lib/esm/experimental/crop-local.mjs'),
      true,
    );
    assert.equal(
      [...requests].some((requestPath) => requestPath.endsWith('.wasm')),
      false,
      `${name} unexpectedly requested WASM`,
    );
    return {
      name,
      version: browser.version(),
      requests: [...requests].sort(),
    };
  } finally {
    await browser.close();
  }
};

const run = async () => {
  const packed = await createPackedConsumer();
  let server;
  try {
    const scriptsDirectory = join(packed.consumerRoot, 'scripts');
    await mkdir(scriptsDirectory, { recursive: true });
    const sourceDirectory = fileURLToPath(new URL('.', import.meta.url));
    await copyFile(
      join(sourceDirectory, 'browser-smoke.html'),
      join(scriptsDirectory, 'browser-smoke.html'),
    );
    await copyFile(
      join(sourceDirectory, 'browser-smoke-worker.mjs'),
      join(scriptsDirectory, 'browser-smoke-worker.mjs'),
    );
    await copyFile(
      join(sourceDirectory, 'browser-smoke-crop-local-fixtures.mjs'),
      join(scriptsDirectory, 'browser-smoke-crop-local-fixtures.mjs'),
    );
    await copyFile(
      join(repositoryRoot, 'example', 'Example.png'),
      join(scriptsDirectory, 'Example.png'),
    );
    server = await startServer(packed.consumerRoot);

    const playwright = await import('playwright');
    const packageRequire = createRequire(join(packed.consumerRoot, 'browser-smoke-node.cjs'));
    const cropLocalApi = packageRequire('image-fingerprint/experimental/crop-local');
    const expectedCropLocal = runCropLocalBrowserFixtures(cropLocalApi);
    const results = [];
    for (const browserName of PLAN.browsers) {
      results.push(await runBrowser(
        browserName,
        playwright[browserName],
        server.url,
        expectedCropLocal,
      ));
    }
    return {
      ...PLAN,
      packageVersion: packed.manifest.version,
      results,
    };
  } finally {
    if (server !== undefined) {
      await server.close();
    }
    await packed.cleanup();
  }
};

try {
  const { planOnly } = parseArguments(process.argv.slice(2));
  const report = planOnly ? PLAN : await run();
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`browser-engine-smoke: ${error.message}\n`);
  process.exitCode = 2;
}
