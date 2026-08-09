const assert = require('node:assert/strict');
const path = require('node:path');
const { fingerprintPixels, imageHash } = require('image-hash');
const legacyBlockHash = require('image-hash/lib/block-hash').default;
const { fingerprintPixels: fingerprintPixelsFromBrowser } = require('image-hash/browser');
const { fingerprintPixels: fingerprintPixelsFromCore } = require('image-hash/core');
const { imageHash: imageHashFromNode } = require('image-hash/node');

assert.equal(imageHashFromNode, imageHash);
assert.equal(typeof legacyBlockHash, 'function');

const fixture = path.join(__dirname, '..', 'example', '_95695590_tv039055678.jpg');
const expected = '0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0';

imageHash(fixture, 16, true, (error, hash) => {
  if (error) {
    throw error;
  }

  assert.equal(hash, expected);
});

const pixels = {
  width: 2,
  height: 2,
  data: new Uint8Array([
    0, 0, 0, 255,
    255, 255, 255, 255,
    64, 64, 64, 255,
    192, 192, 192, 255,
  ]),
};
const options = {
  algorithm: 'blockhash-v1',
  bitsPerSide: 2,
  method: 2,
};

assert.deepEqual(fingerprintPixels(pixels, options), {
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
assert.deepEqual(fingerprintPixelsFromCore(pixels, options), {
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
assert.deepEqual(fingerprintPixelsFromBrowser(pixels, options), {
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

const pdqPixels = {
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
};
const pdqOptions = { algorithm: 'pdq-v1' };
const expectedPdq = {
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  encoding: 'hex',
  hash: 'd4b5348d96a593a4695a93b493a4d9263b0ec67196a59b2693a4348d6cdb6ccb',
  bitLength: 256,
  quality: 59,
};

assert.deepEqual(fingerprintPixels(pdqPixels, pdqOptions), expectedPdq);
assert.deepEqual(fingerprintPixelsFromCore(pdqPixels, pdqOptions), expectedPdq);
assert.deepEqual(fingerprintPixelsFromBrowser(pdqPixels, pdqOptions), expectedPdq);
