import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  fingerprintPixels,
  pixelsFromImageData,
  parseFingerprint,
  serializeFingerprint,
  compareFingerprints,
  evaluatePdqMatch,
  PDQ_STARTING_POLICY,
} from 'image-fingerprint/browser';

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

const pdqFingerprint = fingerprintPixels({
  format: 'gray8',
  width: 5,
  height: 5,
  data: Uint8Array.from([
    0, 41, 82, 123, 164,
    13, 54, 95, 136, 177,
    26, 67, 108, 149, 190,
    39, 80, 121, 162, 203,
    52, 93, 134, 175, 216,
  ]),
}, {
  algorithm: 'pdq-v1',
});

assert.deepEqual(pdqFingerprint, {
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  encoding: 'hex',
  hash: 'd4b5348d96a593a4695a93b493a4d9263b0ec67196a59b2693a4348d6cdb6ccb',
  bitLength: 256,
  quality: 59,
});

const serializedFingerprint = serializeFingerprint(pdqFingerprint);
assert.deepEqual(parseFingerprint(serializedFingerprint), pdqFingerprint);
assert.deepEqual(compareFingerprints(pdqFingerprint, pdqFingerprint), {
  comparable: true,
  algorithm: 'pdq-v1',
  distance: 0,
  bitLength: 256,
  normalizedDistance: 0,
});
assert.deepEqual(evaluatePdqMatch(
  pdqFingerprint,
  pdqFingerprint,
  PDQ_STARTING_POLICY,
), {
  eligible: true,
  matches: true,
  comparison: {
    comparable: true,
    algorithm: 'pdq-v1',
    distance: 0,
    bitLength: 256,
    normalizedDistance: 0,
  },
});

const imageData = {
  width: 5,
  height: 5,
  data: new Uint8ClampedArray(5 * 5 * 4),
};
const wrappedPixels = pixelsFromImageData(imageData);
assert.equal(wrappedPixels.format, 'rgba8');
assert.equal(wrappedPixels.data, imageData.data);

const libDirectory = fileURLToPath(new URL('../lib/esm', import.meta.url));
const files = await readdir(libDirectory, { recursive: true });
const esmFiles = files.filter((file) => file.endsWith('.mjs'));

assert.ok(esmFiles.length > 0, 'Expected the browser build to contain ESM output');

const browserEntry = await readFile(`${libDirectory}/browser.mjs`);
assert.ok(
  gzipSync(browserEntry).byteLength <= 10 * 1024,
  'Browser adapter entry must remain at most 10 KiB gzip',
);

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
  '@cwasm/webp',
  'jpeg-js',
  'pngjs',
  'sharp',
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
