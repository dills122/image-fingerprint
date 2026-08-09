import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_VERSION = 1;
const DEFAULT_REPEAT_COUNT = 2;
const MAXIMUM_REPEAT_COUNT = 10;
const MAXIMUM_FIXTURES = 100;
const MAXIMUM_FIXTURE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_CORPUS_BYTES = 128 * 1024 * 1024;
const MINIMUM_QUALITY = 80;
const MAXIMUM_HAMMING_DISTANCE = 10;
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const PINNED_SHARP_VERSION = '0.35.3';
const PINNED_ORACLE = {
  protocolVersion: 1,
  referenceRepository: 'https://github.com/facebook/ThreatExchange.git',
  referenceCommit: 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424',
};
const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const defaultManifest = fileURLToPath(new URL('./fixtures/manifest.json', import.meta.url));

const usage = () => [
  'Usage: node benchmarks/pdq/adapter-differential.mjs [options]',
  '',
  'Options:',
  '  --oracle <binary>   Pinned native PDQ oracle (required unless --plan-only)',
  '  --manifest <json>   Corpus manifest (default: benchmarks/pdq/fixtures/manifest.json)',
  '  --output <json>     Also write the complete report to this path',
  `  --repeat <integer>  Decoder repetitions, 1-${MAXIMUM_REPEAT_COUNT} (default: ${DEFAULT_REPEAT_COUNT})`,
  '  --plan-only         Validate the corpus and print the comparison plan',
  '  --help              Show this help',
].join('\n');

const parseRepeatCount = (text) => {
  if (!/^[0-9]+$/u.test(text)) {
    throw new Error(`repeat must be an integer between 1 and ${MAXIMUM_REPEAT_COUNT}`);
  }
  const value = Number(text);
  if (value < 1 || value > MAXIMUM_REPEAT_COUNT) {
    throw new Error(`repeat must be an integer between 1 and ${MAXIMUM_REPEAT_COUNT}`);
  }
  return value;
};

const parseArguments = (arguments_) => {
  const options = {
    oracle: undefined,
    manifest: defaultManifest,
    output: undefined,
    repeatCount: DEFAULT_REPEAT_COUNT,
    planOnly: false,
    help: false,
  };
  const valueArguments = new Set(['--oracle', '--manifest', '--output', '--repeat']);
  const booleanArguments = new Set(['--plan-only', '--help']);
  const seen = new Set();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') continue;
    if (!valueArguments.has(argument) && !booleanArguments.has(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`duplicate argument: ${argument}`);
    seen.add(argument);

    if (booleanArguments.has(argument)) {
      options[argument === '--plan-only' ? 'planOnly' : 'help'] = true;
      continue;
    }

    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    if (argument === '--repeat') options.repeatCount = parseRepeatCount(value);
    if (argument === '--oracle') options.oracle = value;
    if (argument === '--manifest') options.manifest = resolve(value);
    if (argument === '--output') options.output = resolve(value);
  }

  if (!options.planOnly && !options.help && options.oracle === undefined) {
    throw new Error('--oracle is required unless --plan-only is used');
  }
  return options;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const assertSafeDimension = (value, field, fixtureId) => {
  if (!Number.isSafeInteger(value) || value < 5 || value > 8192) {
    throw new Error(`${fixtureId} ${field} must be an integer between 5 and 8192`);
  }
};

const loadCorpus = async (manifestPath) => {
  const manifestBytes = await readFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`manifest was not valid JSON: ${error.message}`);
  }
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
    throw new Error('manifest schemaVersion must be 1');
  }
  if (manifest.corpus !== 'pdq-adapter-tolerance-v1') {
    throw new Error('manifest corpus must be pdq-adapter-tolerance-v1');
  }
  if (!Array.isArray(manifest.fixtures)
    || manifest.fixtures.length === 0
    || manifest.fixtures.length > MAXIMUM_FIXTURES) {
    throw new Error(`manifest must contain 1-${MAXIMUM_FIXTURES} fixtures`);
  }

  const manifestDirectory = dirname(manifestPath);
  const directoryPrefix = `${normalize(manifestDirectory)}${sep}`;
  const ids = new Set();
  const fixtureBytesHash = createHash('sha256');
  const fixtures = [];
  let corpusByteLength = 0;

  for (const fixture of manifest.fixtures) {
    if (!isRecord(fixture) || typeof fixture.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(fixture.id)) {
      throw new Error('every fixture id must be a lowercase kebab-case identifier');
    }
    if (ids.has(fixture.id)) throw new Error(`duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);
    if (typeof fixture.file !== 'string' || fixture.file.length === 0) {
      throw new Error(`${fixture.id} file must be a non-empty relative path`);
    }
    const fixturePath = normalize(resolve(manifestDirectory, fixture.file));
    if (isAbsolute(fixture.file) || !fixturePath.startsWith(directoryPrefix)) {
      throw new Error(`${fixture.id} file must stay within the manifest directory`);
    }
    if (!['jpeg', 'png', 'webp'].includes(fixture.format)) {
      throw new Error(`${fixture.id} format must be jpeg, png, or webp`);
    }
    const expectedMediaType = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }[fixture.format];
    if (fixture.mediaType !== expectedMediaType) {
      throw new Error(`${fixture.id} mediaType does not match its format`);
    }
    if (!/^[0-9a-f]{64}$/u.test(fixture.sha256)) {
      throw new Error(`${fixture.id} sha256 must be canonical lowercase hexadecimal`);
    }
    assertSafeDimension(fixture.expectedWidth, 'expectedWidth', fixture.id);
    assertSafeDimension(fixture.expectedHeight, 'expectedHeight', fixture.id);
    if (fixture.expectedWidth * fixture.expectedHeight > 64 * 1024 * 1024) {
      throw new Error(`${fixture.id} dimensions exceed the 64-megapixel corpus limit`);
    }
    if (!Array.isArray(fixture.categories) || fixture.categories.length === 0
      || fixture.categories.some((category) => typeof category !== 'string' || category === '')) {
      throw new Error(`${fixture.id} categories must be a non-empty string array`);
    }
    if (new Set(fixture.categories).size !== fixture.categories.length) {
      throw new Error(`${fixture.id} categories must be unique`);
    }
    if (!isRecord(fixture.provenance)
      || fixture.provenance.kind !== 'generated'
      || typeof fixture.provenance.recipe !== 'string'
      || typeof fixture.provenance.sourceLicense !== 'string') {
      throw new Error(`${fixture.id} must record generated-fixture provenance`);
    }

    const bytes = await readFile(fixturePath);
    if (bytes.byteLength > MAXIMUM_FIXTURE_BYTES) {
      throw new Error(`${fixture.id} exceeds the ${MAXIMUM_FIXTURE_BYTES}-byte fixture limit`);
    }
    corpusByteLength += bytes.byteLength;
    if (corpusByteLength > MAXIMUM_CORPUS_BYTES) {
      throw new Error(`corpus exceeds the ${MAXIMUM_CORPUS_BYTES}-byte total limit`);
    }
    if (fixture.byteLength !== bytes.byteLength) {
      throw new Error(`${fixture.id} byteLength did not match the encoded file`);
    }
    if (sha256(bytes) !== fixture.sha256) {
      throw new Error(`${fixture.id} sha256 did not match the encoded file`);
    }
    fixtureBytesHash.update(fixture.id).update(Buffer.from([0])).update(bytes);
    fixtures.push({ ...fixture, path: fixturePath, bytes });
  }

  if (!Array.isArray(manifest.documentedExceptions)
    || manifest.documentedExceptions.length > 25) {
    throw new Error('manifest documentedExceptions must be an array with at most 25 entries');
  }
  const exceptionKeys = new Set();
  for (const exception of manifest.documentedExceptions) {
    if (!isRecord(exception) || !ids.has(exception.fixture)) {
      throw new Error('every documented exception must name a corpus fixture');
    }
    if (exception.runtime !== 'browser' || !BROWSERS.includes(exception.engine)) {
      throw new Error('documented exceptions must name an approved browser engine');
    }
    if (!Number.isInteger(exception.maximumDistance)
      || exception.maximumDistance <= MAXIMUM_HAMMING_DISTANCE
      || exception.maximumDistance > 256) {
      throw new Error('documented exception maximumDistance must be between 11 and 256');
    }
    if (typeof exception.category !== 'string' || exception.category.length === 0
      || typeof exception.rationale !== 'string' || exception.rationale.length === 0) {
      throw new Error('documented exceptions must include a category and rationale');
    }
    const key = `${exception.fixture}:${exception.runtime}:${exception.engine}`;
    if (exceptionKeys.has(key)) throw new Error(`duplicate documented exception: ${key}`);
    exceptionKeys.add(key);
  }

  return {
    manifest,
    fixtures,
    manifestSha256: sha256(manifestBytes),
    fixtureBytesSha256: fixtureBytesHash.digest('hex'),
    corpusByteLength,
  };
};

const buildPlan = (corpus, repeatCount) => ({
  profileVersion: PROFILE_VERSION,
  mode: 'plan',
  algorithm: 'pdq-v1',
  repeatCount,
  browsers: BROWSERS,
  referencePipeline: {
    decoder: {
      name: 'sharp',
      version: PINNED_SHARP_VERSION,
      operations: ['autoOrient', 'toColourspace:srgb', 'ensureAlpha', 'raw'],
      output: 'straight-alpha-rgba8-srgb',
    },
    oracle: {
      repository: PINNED_ORACLE.referenceRepository,
      commit: PINNED_ORACLE.referenceCommit,
      input: 'rgba8-composited-over-white-to-rgb8',
    },
  },
  gate: {
    minimumQuality: MINIMUM_QUALITY,
    maximumHammingDistance: MAXIMUM_HAMMING_DISTANCE,
    eligibility: 'minimum(reference-quality,candidate-quality)',
  },
  fixtures: {
    corpus: corpus.manifest.corpus,
    count: corpus.fixtures.length,
    encodedBytes: corpus.corpusByteLength,
  },
  categories: [...new Set(corpus.fixtures.flatMap((fixture) => fixture.categories))].sort(),
  documentedExceptions: corpus.manifest.documentedExceptions,
  manifestSha256: corpus.manifestSha256,
  fixtureBytesSha256: corpus.fixtureBytesSha256,
});

const validateOracle = (oracle) => {
  const result = spawnSync(oracle, ['--metadata'], { encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`oracle metadata failed: ${result.stderr.trim()}`);
  }
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    throw new Error('oracle metadata was not valid JSON');
  }
  if (JSON.stringify(metadata) !== JSON.stringify(PINNED_ORACLE)) {
    throw new Error(`oracle metadata did not match the pinned reference: ${result.stdout.trim()}`);
  }
  return metadata;
};

const compositeRgbaOverWhite = (source) => {
  const output = Buffer.alloc(source.length / 4 * 3);
  for (let sourceIndex = 0, outputIndex = 0;
    sourceIndex < source.length;
    sourceIndex += 4, outputIndex += 3) {
    const alpha = source[sourceIndex + 3];
    const whiteContribution = 255 * (255 - alpha);
    for (let channel = 0; channel < 3; channel += 1) {
      output[outputIndex + channel] = Math.floor(
        (source[sourceIndex + channel] * alpha + whiteContribution + 127) / 255,
      );
    }
  }
  return output;
};

const runOracle = (oracle, width, height, bytes) => {
  const result = spawnSync(
    oracle,
    ['rgb8', String(width), String(height)],
    { input: bytes, maxBuffer: 1024 * 1024 },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`oracle failed: ${result.stderr.toString('utf8').trim()}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.toString('utf8'));
  } catch {
    throw new Error('oracle result was not valid JSON');
  }
  if (!/^[0-9a-f]{64}$/u.test(parsed.hash)
    || !Number.isInteger(parsed.quality)
    || parsed.quality < 0
    || parsed.quality > 100) {
    throw new Error('oracle result had an invalid shape');
  }
  return parsed;
};

const loadNodeRuntime = () => {
  const require = createRequire(import.meta.url);
  let decodeImage;
  let fingerprintPixels;
  try {
    ({ decodeImage } = require('../../lib/node.js'));
    ({ fingerprintPixels } = require('../../lib/core/index.js'));
  } catch (error) {
    throw new Error(
      'built Node/core entrypoints were unavailable; run `pnpm build` before the differential suite',
      { cause: error },
    );
  }
  const sharp = require('sharp');
  if (sharp.versions.sharp !== PINNED_SHARP_VERSION) {
    throw new Error(
      `adapter differential requires sharp ${PINNED_SHARP_VERSION}; received ${sharp.versions.sharp}`,
    );
  }
  return { decodeImage, fingerprintPixels, sharpVersions: sharp.versions };
};

const fingerprintShape = (fingerprint) => ({
  hash: fingerprint.hash,
  quality: fingerprint.quality,
});

const collectNodeResults = async (corpus, repeatCount, oracle) => {
  const runtime = loadNodeRuntime();
  const fixtureResults = [];

  for (const fixture of corpus.fixtures) {
    const repetitions = [];
    const references = [];
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const pixels = await runtime.decodeImage(fixture.bytes);
      if (pixels.width !== fixture.expectedWidth || pixels.height !== fixture.expectedHeight) {
        throw new Error(
          `${fixture.id} Node dimensions were ${pixels.width}x${pixels.height}; expected ${fixture.expectedWidth}x${fixture.expectedHeight}`,
        );
      }
      const fingerprint = fingerprintShape(runtime.fingerprintPixels(
        pixels,
        { algorithm: 'pdq-v1' },
      ));
      const rgb = compositeRgbaOverWhite(pixels.data);
      const reference = runOracle(oracle, pixels.width, pixels.height, rgb);
      repetitions.push({
        width: pixels.width,
        height: pixels.height,
        pixelSha256: sha256(pixels.data),
        fingerprint,
      });
      references.push(reference);
    }
    const first = repetitions[0];
    const firstReference = references[0];
    fixtureResults.push({
      id: fixture.id,
      categories: fixture.categories,
      encodedSha256: fixture.sha256,
      width: first.width,
      height: first.height,
      pixelSha256: first.pixelSha256,
      fingerprint: first.fingerprint,
      reference: firstReference,
      repeatedExactly: repetitions.every((result) => (
        result.width === first.width
        && result.height === first.height
        && result.pixelSha256 === first.pixelSha256
        && JSON.stringify(result.fingerprint) === JSON.stringify(first.fingerprint)
      )),
      oracleRepeatedExactly: references.every(
        (result) => JSON.stringify(result) === JSON.stringify(firstReference),
      ),
      typescriptExact: repetitions.every((result, index) => (
        JSON.stringify(result.fingerprint) === JSON.stringify(references[index])
      )),
    });
  }

  return { sharpVersions: runtime.sharpVersions, fixtures: fixtureResults };
};

const contentTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const startServer = async (corpus) => {
  const libRoot = join(repositoryRoot, 'lib');
  const libPrefix = `${normalize(libRoot)}${sep}`;
  const fixtures = new Map(corpus.fixtures.map((fixture) => [fixture.id, fixture]));
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname === '/') {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
        }).end('<!doctype html><meta charset="utf-8"><title>PDQ adapter differential</title>');
        return;
      }
      if (pathname.startsWith('/fixtures/')) {
        const id = decodeURIComponent(pathname.slice('/fixtures/'.length));
        const fixture = fixtures.get(id);
        if (fixture === undefined) {
          response.writeHead(404).end('Not found');
          return;
        }
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': fixture.bytes.byteLength,
          'Content-Type': fixture.mediaType,
          'X-Content-Type-Options': 'nosniff',
        }).end(fixture.bytes);
        return;
      }
      if (pathname.startsWith('/lib/')) {
        const relativePath = decodeURIComponent(pathname.slice('/lib/'.length));
        const file = normalize(join(libRoot, relativePath));
        if (!file.startsWith(libPrefix)) {
          response.writeHead(403).end('Forbidden');
          return;
        }
        const contents = await readFile(file);
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        }).end(contents);
        return;
      }
      response.writeHead(404).end('Not found');
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('loopback server did not expose a TCP port');
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolvePromise, reject) => {
      server.close((error) => error === undefined ? resolvePromise() : reject(error));
    }),
  };
};

const collectBrowserResults = async (corpus, repeatCount) => {
  const playwright = await import('playwright');
  const server = await startServer(corpus);
  const results = [];
  try {
    for (const browserName of BROWSERS) {
      const browser = await playwright[browserName].launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
        const response = await page.goto(server.url, { waitUntil: 'load' });
        if (response?.ok() !== true) throw new Error(`${browserName} did not load the runner page`);
        const browserFixtures = await page.evaluate(async ({ fixtures, repeatCount: repeats }) => {
          const { decodeImage, fingerprintPixels } = await import('/lib/esm/browser.mjs');
          const hexadecimal = (bytes) => [...new Uint8Array(bytes)]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('');
          const output = [];
          for (const fixture of fixtures) {
            const repetitions = [];
            for (let repeat = 0; repeat < repeats; repeat += 1) {
              const encodedResponse = await fetch(`/fixtures/${encodeURIComponent(fixture.id)}`);
              if (!encodedResponse.ok) throw new Error(`${fixture.id} fetch failed`);
              const blob = await encodedResponse.blob();
              const pixels = await decodeImage(blob);
              const digest = await crypto.subtle.digest('SHA-256', pixels.data);
              const fingerprint = fingerprintPixels(pixels, { algorithm: 'pdq-v1' });
              repetitions.push({
                width: pixels.width,
                height: pixels.height,
                pixelSha256: hexadecimal(digest),
                fingerprint: { hash: fingerprint.hash, quality: fingerprint.quality },
              });
            }
            output.push({ id: fixture.id, repetitions });
          }
          return output;
        }, {
          fixtures: corpus.fixtures.map((fixture) => ({ id: fixture.id })),
          repeatCount,
        });
        if (errors.length !== 0) {
          throw new Error(`${browserName} emitted page errors: ${errors.join('; ')}`);
        }
        results.push({
          name: browserName,
          version: browser.version(),
          fixtures: browserFixtures,
        });
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
  return results;
};

const hammingDistance = (left, right) => {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) {
    throw new Error('Hamming distance requires two canonical 256-bit hex hashes');
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value !== 0) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
};

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
};

const summarize = (observations, documentedExceptions) => {
  const categories = ['all', ...new Set(observations.flatMap((item) => item.categories))];
  const runtimeEngines = [...new Set(observations.map(
    (item) => `${item.runtime}:${item.engine}`,
  ))];
  const groups = [];
  for (const runtimeEngine of runtimeEngines) {
    const [runtime, engine] = runtimeEngine.split(':');
    for (const category of categories) {
      const selected = observations.filter((item) => (
        item.runtime === runtime
        && item.engine === engine
        && (category === 'all' || item.categories.includes(category))
      ));
      if (selected.length === 0) continue;
      const eligible = selected.filter((item) => item.eligible);
      const distances = eligible.map((item) => item.distance);
      groups.push({
        runtime,
        engine,
        category,
        count: selected.length,
        eligibleCount: eligible.length,
        belowQualityCount: selected.length - eligible.length,
        passCount: eligible.filter((item) => item.withinGate).length,
        exceptionCount: eligible.filter((item) => !item.withinGate).length,
        distance: {
          p50: percentile(distances, 0.5),
          p95: percentile(distances, 0.95),
          maximum: distances.length === 0 ? null : Math.max(...distances),
        },
      });
    }
  }
  const exceptions = observations
    .filter((item) => item.eligible && !item.withinGate)
    .map((item) => {
      const policy = documentedExceptions.find((exception) => (
        exception.fixture === item.fixture
        && exception.runtime === item.runtime
        && exception.engine === item.engine
      ));
      const documented = policy !== undefined && item.distance <= policy.maximumDistance;
      return {
        fixture: item.fixture,
        runtime: item.runtime,
        engine: item.engine,
        categories: item.categories,
        distance: item.distance,
        referenceQuality: item.referenceQuality,
        candidateQuality: item.candidateQuality,
        documented,
        exceptionCategory: documented ? policy.category : null,
        acceptedMaximumDistance: documented ? policy.maximumDistance : null,
      };
    });
  return {
    percentileMethod: 'nearest-rank',
    groups,
    exceptions,
    unacceptedExceptions: exceptions.filter((exception) => !exception.documented),
  };
};

const buildObservation = (fixture, runtime, engine, candidate, reference) => {
  const distance = hammingDistance(candidate.hash, reference.hash);
  const eligible = Math.min(candidate.quality, reference.quality) >= MINIMUM_QUALITY;
  return {
    fixture: fixture.id,
    categories: fixture.categories,
    runtime,
    engine,
    referenceHash: reference.hash,
    referenceQuality: reference.quality,
    candidateHash: candidate.hash,
    candidateQuality: candidate.quality,
    distance,
    eligible,
    withinGate: !eligible || distance <= MAXIMUM_HAMMING_DISTANCE,
  };
};

const runDifferential = async (options, corpus, plan) => {
  const oracleMetadata = validateOracle(options.oracle);
  const node = await collectNodeResults(corpus, options.repeatCount, options.oracle);
  const browsers = await collectBrowserResults(corpus, options.repeatCount);
  const fixtureMap = new Map(corpus.fixtures.map((fixture) => [fixture.id, fixture]));
  const nodeMap = new Map(node.fixtures.map((fixture) => [fixture.id, fixture]));
  const observations = [];

  for (const nodeFixture of node.fixtures) {
    observations.push(buildObservation(
      fixtureMap.get(nodeFixture.id),
      'node',
      'sharp',
      nodeFixture.fingerprint,
      nodeFixture.reference,
    ));
  }

  const browserReports = browsers.map((browser) => ({
    name: browser.name,
    version: browser.version,
    fixtures: browser.fixtures.map((fixtureResult) => {
      const fixture = fixtureMap.get(fixtureResult.id);
      const nodeFixture = nodeMap.get(fixtureResult.id);
      if (fixture === undefined || nodeFixture === undefined) {
        throw new Error(`browser returned unknown fixture: ${fixtureResult.id}`);
      }
      const first = fixtureResult.repetitions[0];
      if (first.width !== fixture.expectedWidth || first.height !== fixture.expectedHeight) {
        throw new Error(
          `${fixture.id} ${browser.name} dimensions were ${first.width}x${first.height}; expected ${fixture.expectedWidth}x${fixture.expectedHeight}`,
        );
      }
      const repeatedExactly = fixtureResult.repetitions.every((result) => (
        result.width === first.width
        && result.height === first.height
        && result.pixelSha256 === first.pixelSha256
        && JSON.stringify(result.fingerprint) === JSON.stringify(first.fingerprint)
      ));
      observations.push(buildObservation(
        fixture,
        'browser',
        browser.name,
        first.fingerprint,
        nodeFixture.reference,
      ));
      return {
        id: fixture.id,
        width: first.width,
        height: first.height,
        pixelSha256: first.pixelSha256,
        fingerprint: first.fingerprint,
        repeatedExactly,
      };
    }),
  }));

  const summary = summarize(observations, corpus.manifest.documentedExceptions);
  const exactNodeConformance = node.fixtures.every((fixture) => (
    fixture.repeatedExactly && fixture.oracleRepeatedExactly && fixture.typescriptExact
  ));
  const exactBrowserRepeatability = browserReports.every((browser) => (
    browser.fixtures.every((fixture) => fixture.repeatedExactly)
  ));
  const passed = exactNodeConformance
    && exactBrowserRepeatability
    && summary.unacceptedExceptions.length === 0;

  return {
    ...plan,
    mode: 'differential',
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    oracle: oracleMetadata,
    decoder: {
      sharp: node.sharpVersions,
      browsers: browserReports.map(({ name, version }) => ({ name, version })),
    },
    results: {
      node: node.fixtures,
      browsers: browserReports,
      observations,
    },
    summary,
    checks: {
      exactNodeConformance,
      exactBrowserRepeatability,
      initialToleranceGate: summary.exceptions.length === 0,
      documentedExceptionGate: summary.unacceptedExceptions.length === 0,
      passed,
    },
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
  } else {
    const corpus = await loadCorpus(options.manifest);
    const plan = buildPlan(corpus, options.repeatCount);
    const report = options.planOnly
      ? plan
      : await runDifferential(options, corpus, plan);
    const json = options.planOnly
      ? `${JSON.stringify(report)}\n`
      : `${JSON.stringify(report, null, 2)}\n`;
    if (options.output !== undefined) await writeFile(options.output, json);
    process.stdout.write(json);
    if (!options.planOnly && !report.checks.passed) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`pdq-adapter-differential: ${error.message}\n${usage()}\n`);
  process.exitCode = 2;
}
