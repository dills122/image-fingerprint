const CSV_HEADER = [
  'img_path',
  'card_id',
  'set_code',
  'frame_number',
  'corner0_x',
  'corner0_y',
  'corner1_x',
  'corner1_y',
  'corner2_x',
  'corner2_y',
  'corner3_x',
  'corner3_y',
  'num_good_matches',
  'matching_area_pct',
];

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseGitLfsPointer = (input) => {
  const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1\n')) return null;
  const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize ([0-9]+)\n?$/u.exec(text);
  if (match === null) throw new Error('Git LFS pointer did not match the expected SHA-256 schema');
  const byteLength = Number(match[2]);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error('Git LFS pointer size must be a positive safe integer');
  }
  return { sha256: match[1], byteLength };
};

const roundFraction = value => Number(value.toFixed(12));

const parseFiniteFraction = (text, field, rowNumber) => {
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`row ${rowNumber} ${field} must be a finite fraction from 0 through 1`);
  }
  return value;
};

const parseNonNegativeInteger = (text, field, rowNumber) => {
  if (!/^[0-9]+$/u.test(text)) {
    throw new Error(`row ${rowNumber} ${field} must be a non-negative integer`);
  }
  return Number(text);
};

export const parseSolringCornersCsv = (text) => {
  if (typeof text !== 'string') throw new TypeError('CSV input must be a string');
  const lines = text.replaceAll('\r', '').split('\n').filter(line => line.length > 0);
  if (lines.length < 2 || lines[0].split(',').join(',') !== CSV_HEADER.join(',')) {
    throw new Error('Sol Ring corners CSV header did not match the expected schema');
  }

  return lines.slice(1).map((line, index) => {
    const rowNumber = index + 2;
    const values = line.split(',');
    if (values.length !== CSV_HEADER.length) {
      throw new Error(`row ${rowNumber} must contain ${CSV_HEADER.length} columns`);
    }
    const [imagePath, cardId, setCode, frameNumberText, ...numericValues] = values;
    if (!/^data\/frames\/[A-Za-z0-9._-]+\.jpg$/u.test(imagePath) || imagePath.includes('..')) {
      throw new Error(`row ${rowNumber} image path must stay under data/frames`);
    }
    if (cardId.length === 0) throw new Error(`row ${rowNumber} card_id must not be empty`);
    if (!/^[a-z0-9]{2,8}$/u.test(setCode)) {
      throw new Error(`row ${rowNumber} set_code must be lowercase alphanumeric text`);
    }

    const corners = Array.from({ length: 4 }, (_, cornerIndex) => ({
      x: parseFiniteFraction(
        numericValues[cornerIndex * 2],
        `corner${cornerIndex}_x`,
        rowNumber,
      ),
      y: parseFiniteFraction(
        numericValues[cornerIndex * 2 + 1],
        `corner${cornerIndex}_y`,
        rowNumber,
      ),
    }));

    return {
      imagePath,
      cardId,
      setCode,
      frameNumber: parseNonNegativeInteger(frameNumberText, 'frame_number', rowNumber),
      corners,
      goodMatches: parseNonNegativeInteger(numericValues[8], 'num_good_matches', rowNumber),
      matchingAreaFraction: parseFiniteFraction(
        numericValues[9],
        'matching_area_pct',
        rowNumber,
      ),
    };
  });
};

const boundingRegion = (corners) => {
  const x = Math.min(...corners.map(corner => corner.x));
  const y = Math.min(...corners.map(corner => corner.y));
  const maximumX = Math.max(...corners.map(corner => corner.x));
  const maximumY = Math.max(...corners.map(corner => corner.y));
  return {
    units: 'normalized',
    x: roundFraction(x),
    y: roundFraction(y),
    width: roundFraction(maximumX - x),
    height: roundFraction(maximumY - y),
  };
};

const pairEndpoint = (fixtureId, scope) => (
  scope === 'crop-region'
    ? { fixture: fixtureId, region: 'cardBounds' }
    : { fixture: fixtureId }
);

const createScopedPairs = ({ id, left, right, expected, transformations }) => (
  ['full-image', 'crop-region'].map(scope => ({
    id: `${id}-${scope === 'full-image' ? 'full' : 'crop'}`,
    scope,
    expected,
    left: pairEndpoint(left, scope),
    right: pairEndpoint(right, scope),
    transformations,
  }))
);

export const buildSolringManifest = (rows, options) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('rows must be a non-empty array');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  if (!/^[0-9a-f]{40}$/u.test(options.datasetRevision)) {
    throw new Error('datasetRevision must be a 40-character lowercase Git commit');
  }
  if (typeof options.fileMetadata !== 'object' || options.fileMetadata === null) {
    throw new TypeError('fileMetadata must be an object');
  }

  const orderedRows = [...rows].sort((left, right) => (
    left.setCode.localeCompare(right.setCode)
    || left.frameNumber - right.frameNumber
    || left.imagePath.localeCompare(right.imagePath)
  ));
  const fixtures = [];
  const fixtureIds = new Map();
  const groups = new Map();

  for (const row of orderedRows) {
    const metadata = options.fileMetadata[row.imagePath];
    if (typeof metadata !== 'object' || metadata === null) {
      throw new Error(`missing file metadata for ${row.imagePath}`);
    }
    if (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0) {
      throw new Error(`${row.imagePath} byteLength metadata must be a positive safe integer`);
    }
    if (!/^[0-9a-f]{64}$/u.test(metadata.sha256)) {
      throw new Error(`${row.imagePath} sha256 metadata must be canonical hexadecimal`);
    }
    const fixtureId = `${row.setCode}-${String(row.frameNumber).padStart(4, '0')}`;
    if (fixtureIds.has(fixtureId)) throw new Error(`duplicate fixture id: ${fixtureId}`);
    fixtureIds.set(fixtureId, row);

    const groupKey = `${row.setCode}:${row.cardId}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ ...row, fixtureId });
    groups.set(groupKey, group);

    fixtures.push({
      id: fixtureId,
      file: row.imagePath,
      byteLength: metadata.byteLength,
      sha256: metadata.sha256,
      mediaType: 'image/jpeg',
      identity: { namespace: 'scryfall-card-id', value: row.cardId },
      setCode: row.setCode,
      frameNumber: row.frameNumber,
      regions: { cardBounds: boundingRegion(row.corners) },
      sourceAnnotations: {
        goodMatches: row.goodMatches,
        matchingAreaFraction: row.matchingAreaFraction,
      },
    });
  }

  const orderedGroups = [...groups.values()].sort((left, right) => (
    left[0].setCode.localeCompare(right[0].setCode)
  ));
  const pairs = [];
  for (const group of orderedGroups) {
    for (let index = 1; index < group.length; index += 1) {
      pairs.push(...createScopedPairs({
        id: `same-${group[0].setCode}-${String(group[index - 1].frameNumber).padStart(4, '0')}-${String(group[index].frameNumber).padStart(4, '0')}`,
        left: group[index - 1].fixtureId,
        right: group[index].fixtureId,
        expected: 'match',
        transformations: ['camera-angle', 'lighting', 'capture-time'],
      }));
    }
  }
  for (let leftIndex = 0; leftIndex < orderedGroups.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < orderedGroups.length; rightIndex += 1) {
      const leftGroup = orderedGroups[leftIndex];
      const rightGroup = orderedGroups[rightIndex];
      const left = leftGroup[Math.floor(leftGroup.length / 2)];
      const right = rightGroup[Math.floor(rightGroup.length / 2)];
      pairs.push(...createScopedPairs({
        id: `different-${left.setCode}-${right.setCode}`,
        left: left.fixtureId,
        right: right.fixtureId,
        expected: 'non-match',
        transformations: ['different-printing', 'shared-artwork'],
      }));
    }
  }

  return {
    schemaVersion: 1,
    corpus: 'pdq-mtg-solring-calibration-v1',
    description: 'Real-camera Sol Ring frames for exact-printing PDQ calibration.',
    source: {
      repository: 'https://huggingface.co/datasets/HanClinto/solring-eval',
      revision: options.datasetRevision,
      license: 'CC-BY-SA-4.0',
      attribution: 'Sol Ring Dataset © 2026 HanClinto Games, LLC',
      sourceImages: 'local-only',
      redistributionNote: 'Source images are not committed to or published with image-fingerprint.',
    },
    fixtures,
    pairs,
  };
};

const assertNormalizedRegion = (region, fixtureId, regionName) => {
  if (!isRecord(region) || region.units !== 'normalized') {
    throw new Error(`${fixtureId} region ${regionName} must use normalized coordinates`);
  }
  for (const field of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(region[field]) || region[field] < 0 || region[field] > 1) {
      throw new Error(`${fixtureId} region ${regionName} ${field} must be from 0 through 1`);
    }
  }
  if (region.width <= 0 || region.height <= 0
    || region.x + region.width > 1 + Number.EPSILON
    || region.y + region.height > 1 + Number.EPSILON) {
    throw new Error(`${fixtureId} region ${regionName} must have positive in-bounds dimensions`);
  }
};

export const validateMatchingManifest = (manifest) => {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1
    || manifest.corpus !== 'pdq-mtg-solring-calibration-v1') {
    throw new Error('manifest must use pdq-mtg-solring-calibration-v1 schema version 1');
  }
  if (!isRecord(manifest.source)
    || manifest.source.license !== 'CC-BY-SA-4.0'
    || !/^[0-9a-f]{40}$/u.test(manifest.source.revision)
    || manifest.source.sourceImages !== 'local-only'
    || typeof manifest.source.repository !== 'string'
    || manifest.source.repository.length === 0
    || typeof manifest.source.attribution !== 'string'
    || manifest.source.attribution.length === 0) {
    throw new Error('manifest source must retain the pinned license, revision, and attribution');
  }
  if (!Array.isArray(manifest.fixtures)
    || manifest.fixtures.length === 0
    || manifest.fixtures.length > 1_000) {
    throw new Error('manifest must contain 1-1000 fixtures');
  }

  const fixtures = new Map();
  for (const fixture of manifest.fixtures) {
    if (!isRecord(fixture) || typeof fixture.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(fixture.id)) {
      throw new Error('fixture ids must be lowercase kebab-case identifiers');
    }
    if (fixtures.has(fixture.id)) throw new Error(`duplicate fixture id: ${fixture.id}`);
    if (typeof fixture.file !== 'string'
      || !/^data\/frames\/[A-Za-z0-9._-]+\.jpg$/u.test(fixture.file)
      || fixture.file.includes('..')) {
      throw new Error(`${fixture.id} file path must stay under data/frames`);
    }
    if (!Number.isSafeInteger(fixture.byteLength)
      || fixture.byteLength <= 0
      || fixture.byteLength > 32 * 1024 * 1024
      || !/^[0-9a-f]{64}$/u.test(fixture.sha256)
      || fixture.mediaType !== 'image/jpeg') {
      throw new Error(`${fixture.id} must include valid JPEG byte metadata`);
    }
    if (!isRecord(fixture.identity)
      || fixture.identity.namespace !== 'scryfall-card-id'
      || typeof fixture.identity.value !== 'string'
      || fixture.identity.value.length === 0) {
      throw new Error(`${fixture.id} must include its Scryfall printing identity`);
    }
    if (!isRecord(fixture.regions)
      || Object.keys(fixture.regions).length === 0
      || Object.keys(fixture.regions).length > 10) {
      throw new Error(`${fixture.id} must include 1-10 caller-supplied regions`);
    }
    for (const [regionName, region] of Object.entries(fixture.regions)) {
      if (!/^[a-z][A-Za-z0-9]{0,39}$/u.test(regionName)) {
        throw new Error(`${fixture.id} region names must be lower camel case`);
      }
      assertNormalizedRegion(region, fixture.id, regionName);
    }
    fixtures.set(fixture.id, fixture);
  }

  if (!Array.isArray(manifest.pairs)
    || manifest.pairs.length === 0
    || manifest.pairs.length > 100_000) {
    throw new Error('manifest must contain 1-100000 labeled pairs');
  }
  const pairIds = new Set();
  for (const pair of manifest.pairs) {
    if (!isRecord(pair) || typeof pair.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]{0,119}$/u.test(pair.id)) {
      throw new Error('pair ids must be lowercase kebab-case identifiers');
    }
    if (pairIds.has(pair.id)) throw new Error(`duplicate pair id: ${pair.id}`);
    pairIds.add(pair.id);
    if (!['full-image', 'crop-region'].includes(pair.scope)
      || !['match', 'non-match'].includes(pair.expected)) {
      throw new Error(`${pair.id} must declare a valid scope and expected relationship`);
    }
    if (!Array.isArray(pair.transformations) || pair.transformations.length === 0
      || pair.transformations.length > 20
      || pair.transformations.some(value => (
        typeof value !== 'string' || value.length === 0 || value.length > 64
      ))
      || new Set(pair.transformations).size !== pair.transformations.length) {
      throw new Error(`${pair.id} transformations must be a non-empty unique string array`);
    }
    for (const [side, endpoint] of [['left', pair.left], ['right', pair.right]]) {
      if (!isRecord(endpoint) || !fixtures.has(endpoint.fixture)) {
        throw new Error(`${pair.id} ${side} must reference a known fixture`);
      }
      const fixture = fixtures.get(endpoint.fixture);
      if (pair.scope === 'full-image') {
        if ('region' in endpoint) {
          throw new Error(`${pair.id} full-image endpoint must not name a region`);
        }
      } else if (typeof endpoint.region !== 'string' || !(endpoint.region in fixture.regions)) {
        throw new Error(`${pair.id} ${side} must reference a known crop region`);
      }
    }
    const leftIdentity = fixtures.get(pair.left.fixture).identity.value;
    const rightIdentity = fixtures.get(pair.right.fixture).identity.value;
    if ((pair.expected === 'match') !== (leftIdentity === rightIdentity)) {
      throw new Error(`${pair.id} label contradicts its exact-printing identity`);
    }
  }

  return manifest;
};
