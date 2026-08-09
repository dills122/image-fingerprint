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
  assert.ok(parsed.lumaBits.every(Number.isInteger));
  assert.ok(parsed.downsampledBits.every(Number.isInteger));
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

process.stdout.write(`${JSON.stringify({
  gray8: firstGray,
  rgb8: firstRgb,
  diagnostics: {
    lumaValues: diagnostics.lumaBits.length,
    downsampledValues: diagnostics.downsampledBits.length,
    quality: diagnostics.quality,
  },
})}\n`);
