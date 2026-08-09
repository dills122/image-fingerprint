import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createPackedConsumer,
  repositoryRoot,
  runCommand,
} from './packed-consumer-utils.mjs';

const PLAN = {
  profileVersion: 1,
  packageSource: 'packed-tarball',
  runtimeConsumers: ['commonjs', 'esm'],
  typeScriptResolutions: ['node16', 'nodenext', 'bundler'],
  packageSubpaths: [
    '.',
    './node',
    './core',
    './browser',
    './package.json',
  ],
};

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') {
    return { planOnly: true };
  }
  if (arguments_.length === 0) {
    return { planOnly: false };
  }
  throw new Error('Usage: node scripts/packed-package-smoke.mjs [--plan-only]');
};

const grayValues = [
  0, 41, 82, 123, 164,
  13, 54, 95, 136, 177,
  26, 67, 108, 149, 190,
  39, 80, 121, 162, 203,
  52, 93, 134, 175, 216,
];

const expectedFingerprint = {
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  encoding: 'hex',
  hash: 'd4b5348d96a593a4695a93b493a4d9263b0ec67196a59b2693a4348d6cdb6ccb',
  bitLength: 256,
  quality: 59,
};

const commonJsConsumer = `
const assert = require('node:assert/strict');
const root = require('image-fingerprint');
const nodeEntry = require('image-fingerprint/node');
const core = require('image-fingerprint/core');
const browser = require('image-fingerprint/browser');
const metadata = require('image-fingerprint/package.json');

const pixels = ${JSON.stringify(grayValues)};
const expected = ${JSON.stringify(expectedFingerprint)};
const input = { format: 'gray8', width: 5, height: 5, data: Uint8Array.from(pixels) };
const options = { algorithm: 'pdq-v1' };
const fixture = ${JSON.stringify(join(repositoryRoot, 'example', '_95695590_tv039055678.jpg'))};
const blockHashOptions = { algorithm: 'blockhash-v1', bitsPerSide: 16, method: 2 };
const historicalHash = '0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0';

assert.equal(typeof nodeEntry.decodeImage, 'function');
assert.equal(typeof nodeEntry.fingerprintImage, 'function');
assert.equal('imageHash' in root, false);
assert.equal('imageHash' in nodeEntry, false);
assert.throws(
  () => require('image-fingerprint/lib/block-hash'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
assert.equal(metadata.name, 'image-fingerprint');
assert.equal(typeof core.extractPixelRegion, 'function');
assert.equal(typeof browser.decodeImage, 'function');
assert.equal(typeof browser.fingerprintImage, 'function');
assert.equal(typeof browser.pixelsFromImageData, 'function');
assert.deepEqual(root.fingerprintPixels(input, options), expected);
assert.deepEqual(core.fingerprintPixels(input, options), expected);
assert.deepEqual(browser.fingerprintPixels(input, options), expected);
Promise.all([
  nodeEntry.fingerprintImage(fixture, blockHashOptions),
  nodeEntry.fingerprintImage(fixture, {
    ...blockHashOptions,
    decoderMode: 'image-hash-v7',
  }),
]).then(([normalized, historical]) => {
  assert.equal(normalized.algorithm, 'blockhash-v1');
  assert.equal(historical.hash, historicalHash);
}).catch((error) => {
  process.nextTick(() => { throw error; });
});
`;

const esModuleConsumer = `
import assert from 'node:assert/strict';
import {
  fingerprintPixels as fingerprintRoot,
} from 'image-fingerprint';
import {
  decodeImage as decodeImageNode,
  fingerprintImage as fingerprintImageNode,
} from 'image-fingerprint/node';
import {
  extractPixelRegion,
  fingerprintPixels as fingerprintCore,
} from 'image-fingerprint/core';
import {
  decodeImage as decodeImageBrowser,
  fingerprintImage as fingerprintImageBrowser,
  fingerprintPixels as fingerprintBrowser,
  pixelsFromImageData,
} from 'image-fingerprint/browser';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const metadata = require('image-fingerprint/package.json');
const pixels = ${JSON.stringify(grayValues)};
const expected = ${JSON.stringify(expectedFingerprint)};
const input = { format: 'gray8', width: 5, height: 5, data: Uint8Array.from(pixels) };
const options = { algorithm: 'pdq-v1' };
const fixture = ${JSON.stringify(join(repositoryRoot, 'example', '_95695590_tv039055678.jpg'))};
const blockHashOptions = { algorithm: 'blockhash-v1', bitsPerSide: 16, method: 2 };
const historicalHash = '0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0';

assert.equal(typeof decodeImageNode, 'function');
assert.equal(typeof fingerprintImageNode, 'function');
assert.equal('imageHash' in await import('image-fingerprint'), false);
assert.equal('imageHash' in await import('image-fingerprint/node'), false);
await assert.rejects(
  import('image-fingerprint/lib/block-hash'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
assert.equal(metadata.name, 'image-fingerprint');
assert.equal(typeof extractPixelRegion, 'function');
assert.equal(typeof decodeImageBrowser, 'function');
assert.equal(typeof fingerprintImageBrowser, 'function');
assert.equal(typeof pixelsFromImageData, 'function');
assert.deepEqual(fingerprintRoot(input, options), expected);
assert.deepEqual(fingerprintCore(input, options), expected);
assert.deepEqual(fingerprintBrowser(input, options), expected);
const [normalized, historical] = await Promise.all([
  fingerprintImageNode(fixture, blockHashOptions),
  fingerprintImageNode(fixture, {
    ...blockHashOptions,
    decoderMode: 'image-hash-v7',
  }),
]);
assert.equal(normalized.algorithm, 'blockhash-v1');
assert.equal(historical.hash, historicalHash);
`;

const typeScriptConsumer = `
import { fingerprintPixels as fingerprintRoot } from 'image-fingerprint';
import {
  decodeImage as decodeImageNode,
  fingerprintImage as fingerprintImageNode,
  fingerprintPixels as fingerprintNode,
} from 'image-fingerprint/node';
import {
  extractPixelRegion,
  fingerprintPixels as fingerprintCore,
  serializeFingerprint,
  type ImageDecoder,
} from 'image-fingerprint/core';
import type { NodeImageDecoderMode } from 'image-fingerprint/node';
import {
  decodeImage as decodeImageBrowser,
  fingerprintImage as fingerprintImageBrowser,
  fingerprintPixels as fingerprintBrowser,
  pixelsFromImageData,
} from 'image-fingerprint/browser';

const input = {
  format: 'gray8' as const,
  width: 5,
  height: 5,
  data: new Uint8Array(25),
};
const options = { algorithm: 'pdq-v1' as const };
const fingerprint = fingerprintCore(input, options);
const decoderMode: NodeImageDecoderMode = 'image-hash-v7';
const blockHashOptions = {
  algorithm: 'blockhash-v1' as const,
  bitsPerSide: 16,
  method: 2 as const,
  decoderMode,
};

fingerprintRoot(input, options);
fingerprintNode(input, options);
fingerprintBrowser(input, options);
serializeFingerprint(fingerprint);
fingerprintImageNode(new Uint8Array(), blockHashOptions);
const decoder: ImageDecoder<string | URL | Uint8Array> = {
  decodeImage: decodeImageNode,
  fingerprintImage: fingerprintImageNode,
};
extractPixelRegion(input, { x: 0, y: 0, width: 5, height: 5 });
void decodeImageBrowser;
void fingerprintImageBrowser;
void pixelsFromImageData;
void decoder;
`;

const tsConfig = (module, moduleResolution, file) => JSON.stringify({
  compilerOptions: {
    esModuleInterop: true,
    module,
    moduleResolution,
    noEmit: true,
    strict: true,
    target: 'ES2022',
    types: ['node'],
  },
  files: [file],
});

const run = async () => {
  const packed = await createPackedConsumer({ includeNodeTypes: true });
  try {
    await writeFile(join(packed.consumerRoot, 'consumer.cjs'), commonJsConsumer);
    await writeFile(join(packed.consumerRoot, 'consumer.mjs'), esModuleConsumer);
    await writeFile(join(packed.consumerRoot, 'consumer.cts'), typeScriptConsumer);
    await writeFile(join(packed.consumerRoot, 'consumer.mts'), typeScriptConsumer);
    await writeFile(join(packed.consumerRoot, 'consumer.ts'), typeScriptConsumer);
    await writeFile(
      join(packed.consumerRoot, 'tsconfig.node16.json'),
      tsConfig('Node16', 'Node16', 'consumer.cts'),
    );
    await writeFile(
      join(packed.consumerRoot, 'tsconfig.nodenext.json'),
      tsConfig('NodeNext', 'NodeNext', 'consumer.mts'),
    );
    await writeFile(
      join(packed.consumerRoot, 'tsconfig.bundler.json'),
      tsConfig('ESNext', 'Bundler', 'consumer.ts'),
    );

    runCommand(process.execPath, ['consumer.cjs'], { cwd: packed.consumerRoot });
    runCommand(process.execPath, ['consumer.mjs'], { cwd: packed.consumerRoot });
    const compiler = join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const resolution of PLAN.typeScriptResolutions) {
      runCommand(process.execPath, [compiler, '-p', `tsconfig.${resolution}.json`], {
        cwd: packed.consumerRoot,
      });
    }

    return {
      ...PLAN,
      packageVersion: packed.manifest.version,
      runtimeChecks: 2,
      typeScriptChecks: 3,
    };
  } finally {
    await packed.cleanup();
  }
};

try {
  const { planOnly } = parseArguments(process.argv.slice(2));
  const report = planOnly ? PLAN : await run();
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`packed-package-smoke: ${error.message}\n`);
  process.exitCode = 2;
}
