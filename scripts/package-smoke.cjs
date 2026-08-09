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
