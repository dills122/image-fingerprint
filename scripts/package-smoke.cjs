const assert = require('node:assert/strict');
const path = require('node:path');
const {
  fingerprintPixels,
  imageHash,
  parseFingerprint,
  serializeFingerprint,
  compareFingerprints,
} = require('image-fingerprint');
const legacyBlockHash = require('image-fingerprint/lib/block-hash').default;
const {
  fingerprintPixels: fingerprintPixelsFromBrowser,
  parseFingerprint: parseFingerprintFromBrowser,
  PDQ_STARTING_POLICY,
  pixelsFromImageData,
} = require('image-fingerprint/browser');
const {
  fingerprintPixels: fingerprintPixelsFromCore,
  serializeFingerprint: serializeFingerprintFromCore,
  evaluatePdqMatch,
} = require('image-fingerprint/core');
const {
  decodeImage,
  fingerprintImage,
  imageHash: imageHashFromNode,
} = require('image-fingerprint/node');

assert.equal(
  Object.keys(require.cache).some((id) => id.includes('/sharp/')),
  false,
  'Requiring image-fingerprint/node must not eagerly load Sharp',
);

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

const canonicalPdq = JSON.stringify(expectedPdq);
assert.equal(serializeFingerprint(expectedPdq), canonicalPdq);
assert.equal(serializeFingerprintFromCore(expectedPdq), canonicalPdq);
assert.deepEqual(parseFingerprint(canonicalPdq), expectedPdq);
assert.deepEqual(parseFingerprintFromBrowser(canonicalPdq), expectedPdq);
assert.deepEqual(compareFingerprints(expectedPdq, expectedPdq), {
  comparable: true,
  algorithm: 'pdq-v1',
  distance: 0,
  bitLength: 256,
  normalizedDistance: 0,
});
assert.deepEqual(evaluatePdqMatch(expectedPdq, expectedPdq, PDQ_STARTING_POLICY), {
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

Promise.all([
  decodeImage(fixture),
  fingerprintImage(fixture, pdqOptions),
]).then(([decoded, encodedFingerprint]) => {
  assert.equal(decoded.format, 'rgba8');
  assert.deepEqual(
    encodedFingerprint,
    fingerprintPixelsFromCore(decoded, pdqOptions),
  );
}).catch((error) => {
  process.nextTick(() => {
    throw error;
  });
});
