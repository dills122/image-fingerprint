import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fingerprintPixels } from 'image-hash/browser';

const { imageHash: imageHashFromNode } = await import('image-hash/node');
assert.equal(typeof imageHashFromNode, 'function');

const fingerprint = fingerprintPixels({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    64, 64, 64, 255,
    192, 192, 192, 255,
  ]),
}, {
  algorithm: 'blockhash-v1',
  bitsPerSide: 2,
  method: 2,
});

assert.deepEqual(fingerprint, {
  schemaVersion: 1,
  algorithm: 'blockhash-v1',
  encoding: 'hex',
  hash: '5',
  bitLength: 4,
  parameters: {
    bitsPerSide: 2,
    method: 2,
  },
});

const libDirectory = fileURLToPath(new URL('../lib/esm', import.meta.url));
const files = await readdir(libDirectory, { recursive: true });
const esmFiles = files.filter((file) => file.endsWith('.mjs'));

assert.ok(esmFiles.length > 0, 'Expected the browser build to contain ESM output');

const forbiddenBrowserImports = [
  '__vite-browser-external',
  'node:assert',
  'node:buffer',
  'node:fs',
  'node:path',
  'node:stream',
  'node:url',
  'node:util',
  'node:zlib',
];

for (const file of esmFiles) {
  const contents = await readFile(`${libDirectory}/${file}`, 'utf8');
  for (const forbiddenImport of forbiddenBrowserImports) {
    assert.equal(
      contents.includes(forbiddenImport),
      false,
      `Browser output ${file} contains ${forbiddenImport}`,
    );
  }
}
