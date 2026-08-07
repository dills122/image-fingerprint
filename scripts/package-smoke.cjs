const assert = require('node:assert/strict');
const path = require('node:path');
const { imageHash } = require('../lib');

const fixture = path.join(__dirname, '..', 'example', '_95695590_tv039055678.jpg');
const expected = '0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0';

imageHash(fixture, 16, true, (error, hash) => {
  if (error) {
    throw error;
  }

  assert.equal(hash, expected);
});
