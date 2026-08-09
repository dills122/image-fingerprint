import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const oracleFlag = process.argv.indexOf('--oracle');
if (oracleFlag === -1 || oracleFlag + 1 >= process.argv.length) {
  throw new Error('Usage: node scripts/pdq-oracle-smoke.mjs --oracle <binary>');
}
const oracle = process.argv[oracleFlag + 1];

const metadataResult = spawnSync(oracle, ['--metadata']);
assert.ifError(metadataResult.error);
assert.equal(
  metadataResult.status,
  0,
  `Oracle metadata failed: ${metadataResult.stderr.toString('utf8')}`,
);
assert.deepEqual(JSON.parse(metadataResult.stdout.toString('utf8')), {
  protocolVersion: 1,
  referenceRepository: 'https://github.com/facebook/ThreatExchange.git',
  referenceCommit: 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424',
});

const runOracle = (format, width, height, bytes) => {
  const result = spawnSync(
    oracle,
    [format, String(width), String(height)],
    { input: bytes },
  );
  assert.equal(
    result.status,
    0,
    `Oracle failed: ${result.stderr.toString('utf8')}`,
  );

  const parsed = JSON.parse(result.stdout.toString('utf8'));
  assert.match(parsed.hash, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(parsed.quality));
  assert.ok(parsed.quality >= 0 && parsed.quality <= 100);
  return parsed;
};

const runDiagnostics = (format, width, height, bytes) => {
  const result = spawnSync(
    oracle,
    ['--diagnostics', format, String(width), String(height)],
    { input: bytes },
  );
  assert.equal(
    result.status,
    0,
    `Oracle diagnostics failed: ${result.stderr.toString('utf8')}`,
  );

  const parsed = JSON.parse(result.stdout.toString('utf8'));
  assert.equal(parsed.lumaBits.length, width * height);
  assert.equal(parsed.downsampledBits.length, 64 * 64);
  assert.equal(parsed.dctIntermediateBits.length, 16 * 64);
  assert.equal(parsed.dctOutputBits.length, 16 * 16);
  assert.ok(parsed.lumaBits.every(Number.isInteger));
  assert.ok(parsed.downsampledBits.every(Number.isInteger));
  assert.ok(parsed.dctIntermediateBits.every(Number.isInteger));
  assert.ok(parsed.dctOutputBits.every(Number.isInteger));
  assert.ok(Number.isInteger(parsed.medianBits));
  assert.match(parsed.hash, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(parsed.quality));
  return parsed;
};

const width = 17;
const height = 19;
const gray = Buffer.alloc(width * height);
const rgb = Buffer.alloc(width * height * 3);
for (let index = 0; index < gray.length; index += 1) {
  const value = (index * 29 + Math.floor(index / width) * 17) & 0xff;
  gray[index] = value;
  rgb[index * 3] = value;
  rgb[index * 3 + 1] = value;
  rgb[index * 3 + 2] = value;
}

const firstGray = runOracle('gray8', width, height, gray);
const secondGray = runOracle('gray8', width, height, gray);
const firstRgb = runOracle('rgb8', width, height, rgb);
const secondRgb = runOracle('rgb8', width, height, rgb);

assert.deepEqual(secondGray, firstGray);
assert.deepEqual(secondRgb, firstRgb);
assert.deepEqual(firstRgb, firstGray);

const diagnostics = runDiagnostics('gray8', width, height, gray);
assert.equal(diagnostics.quality, firstGray.quality);

const invalid = spawnSync(oracle, ['gray8', '5', '5'], {
  input: Buffer.alloc(24),
});
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr.toString('utf8'), /expected 25 input bytes, received 24/);

const tooLarge = spawnSync(oracle, ['gray8', '8193', '8193']);
assert.notEqual(tooLarge.status, 0);
assert.match(tooLarge.stderr.toString('utf8'), /input exceeds 67108864-byte limit/);

const batchMagic = Buffer.from('PDQB001', 'ascii');
const batchRequest = (vectors) => {
  const batchHeader = Buffer.alloc(batchMagic.length + 4);
  batchMagic.copy(batchHeader);
  batchHeader.writeUInt32LE(vectors.length, batchMagic.length);
  const chunks = [batchHeader];
  for (const vector of vectors) {
    const requestHeader = Buffer.alloc(13);
    requestHeader.writeUInt8(vector.format === 'gray8' ? 1 : 2, 0);
    requestHeader.writeUInt32LE(vector.width, 1);
    requestHeader.writeUInt32LE(vector.height, 5);
    requestHeader.writeUInt32LE(vector.bytes.length, 9);
    chunks.push(requestHeader, vector.bytes);
  }
  return Buffer.concat(chunks);
};

const batchInput = batchRequest([
  { format: 'gray8', width, height, bytes: gray },
  { format: 'rgb8', width, height, bytes: rgb },
]);
const batch = spawnSync(oracle, ['--batch'], { input: batchInput });
assert.equal(batch.status, 0, batch.stderr.toString('utf8'));
assert.deepEqual(
  batch.stdout.toString('utf8').trim().split('\n').map(JSON.parse),
  [firstGray, firstRgb],
);

const truncatedBatch = spawnSync(oracle, ['--batch'], {
  input: batchInput.subarray(0, batchInput.length - 1),
});
assert.notEqual(truncatedBatch.status, 0);
assert.match(truncatedBatch.stderr.toString('utf8'), /truncated batch input/);

const invalidMagic = Buffer.from(batchInput);
invalidMagic[0] ^= 0xff;
const invalidMagicBatch = spawnSync(oracle, ['--batch'], { input: invalidMagic });
assert.notEqual(invalidMagicBatch.status, 0);
assert.match(invalidMagicBatch.stderr.toString('utf8'), /invalid batch magic/);

const emptyBatch = batchRequest([]);
const emptyBatchResult = spawnSync(oracle, ['--batch'], { input: emptyBatch });
assert.notEqual(emptyBatchResult.status, 0);
assert.match(emptyBatchResult.stderr.toString('utf8'), /between 1 and 100000/);

const invalidFormat = Buffer.from(batchInput);
invalidFormat[batchMagic.length + 4] = 3;
const invalidFormatBatch = spawnSync(oracle, ['--batch'], { input: invalidFormat });
assert.notEqual(invalidFormatBatch.status, 0);
assert.match(invalidFormatBatch.stderr.toString('utf8'), /format must be 1 or 2/);

const invalidLength = Buffer.from(batchInput);
invalidLength.writeUInt32LE(gray.length - 1, batchMagic.length + 4 + 9);
const invalidLengthBatch = spawnSync(oracle, ['--batch'], { input: invalidLength });
assert.notEqual(invalidLengthBatch.status, 0);
assert.match(invalidLengthBatch.stderr.toString('utf8'), /declared 322 input bytes, expected 323/);

const trailingBatch = spawnSync(oracle, ['--batch'], {
  input: Buffer.concat([batchInput, Buffer.from([0])]),
});
assert.notEqual(trailingBatch.status, 0);
assert.match(trailingBatch.stderr.toString('utf8'), /trailing bytes/);

process.stdout.write(`${JSON.stringify({
  gray8: firstGray,
  rgb8: firstRgb,
  diagnostics: {
    lumaValues: diagnostics.lumaBits.length,
    downsampledValues: diagnostics.downsampledBits.length,
    dctIntermediateValues: diagnostics.dctIntermediateBits.length,
    dctOutputValues: diagnostics.dctOutputBits.length,
    hash: diagnostics.hash,
    quality: diagnostics.quality,
  },
})}\n`);
