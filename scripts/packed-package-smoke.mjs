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
    './lib/block-hash',
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
const legacyBlockHash = require('image-fingerprint/lib/block-hash').default;
const metadata = require('image-fingerprint/package.json');

const pixels = ${JSON.stringify(grayValues)};
const expected = ${JSON.stringify(expectedFingerprint)};
const input = { format: 'gray8', width: 5, height: 5, data: Uint8Array.from(pixels) };
const options = { algorithm: 'pdq-v1' };

assert.equal(nodeEntry.imageHash, root.imageHash);
assert.equal(typeof legacyBlockHash, 'function');
assert.equal(metadata.name, 'image-fingerprint');
assert.deepEqual(root.fingerprintPixels(input, options), expected);
assert.deepEqual(core.fingerprintPixels(input, options), expected);
assert.deepEqual(browser.fingerprintPixels(input, options), expected);
`;

const esModuleConsumer = `
import assert from 'node:assert/strict';
import {
  fingerprintPixels as fingerprintRoot,
  imageHash,
} from 'image-fingerprint';
import { imageHash as imageHashFromNode } from 'image-fingerprint/node';
import { fingerprintPixels as fingerprintCore } from 'image-fingerprint/core';
import { fingerprintPixels as fingerprintBrowser } from 'image-fingerprint/browser';
import legacyBlockHashModule from 'image-fingerprint/lib/block-hash';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const metadata = require('image-fingerprint/package.json');
const pixels = ${JSON.stringify(grayValues)};
const expected = ${JSON.stringify(expectedFingerprint)};
const input = { format: 'gray8', width: 5, height: 5, data: Uint8Array.from(pixels) };
const options = { algorithm: 'pdq-v1' };

assert.equal(imageHashFromNode, imageHash);
assert.equal(typeof legacyBlockHashModule.default, 'function');
assert.equal(metadata.name, 'image-fingerprint');
assert.deepEqual(fingerprintRoot(input, options), expected);
assert.deepEqual(fingerprintCore(input, options), expected);
assert.deepEqual(fingerprintBrowser(input, options), expected);
`;

const typeScriptConsumer = `
import { fingerprintPixels as fingerprintRoot, imageHash } from 'image-fingerprint';
import { fingerprintPixels as fingerprintNode } from 'image-fingerprint/node';
import {
  fingerprintPixels as fingerprintCore,
  serializeFingerprint,
} from 'image-fingerprint/core';
import { fingerprintPixels as fingerprintBrowser } from 'image-fingerprint/browser';
import legacyBlockHash from 'image-fingerprint/lib/block-hash';

const input = {
  format: 'gray8' as const,
  width: 5,
  height: 5,
  data: new Uint8Array(25),
};
const options = { algorithm: 'pdq-v1' as const };
const fingerprint = fingerprintCore(input, options);

fingerprintRoot(input, options);
fingerprintNode(input, options);
fingerprintBrowser(input, options);
serializeFingerprint(fingerprint);
void imageHash;
void legacyBlockHash;
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
