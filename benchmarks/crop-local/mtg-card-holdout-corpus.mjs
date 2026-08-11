import { createHash } from 'node:crypto';
import { transformCropLocalCalibration } from './calibration-corpus.mjs';

export const MTG_CARD_HOLDOUT_ERAS = Object.freeze([
  Object.freeze({ id: '1993-2002', releasedAfter: '1993-01-01', releasedBefore: '2002-12-31' }),
  Object.freeze({ id: '2003-2012', releasedAfter: '2003-01-01', releasedBefore: '2012-12-31' }),
  Object.freeze({ id: '2013-2022', releasedAfter: '2013-01-01', releasedBefore: '2022-12-31' }),
  Object.freeze({ id: '2023-2026', releasedAfter: '2023-01-01', releasedBefore: '2026-08-09' }),
]);

export const MTG_CARD_RECALL_HOLDOUT_PROFILE = Object.freeze({
  schemaVersion: 1,
  corpus: 'crop-local-card-recall-mtg-holdout-v1',
  policy: 'frozen-card-recall-development-profile',
  selectionSeed: 2_026_081_001,
  sourcesPerEra: 25,
  totalSources: 100,
  transformations: Object.freeze(['center', 'severe', 'normalized-capture']),
  totalPositivePairs: 300,
  negativePairings: Object.freeze([
    Object.freeze(['original', 'original']),
    Object.freeze(['original', 'normalized-capture']),
    Object.freeze(['normalized-capture', 'normalized-capture']),
  ]),
  totalNegativePairs: 14_850,
  gate: Object.freeze({
    minimumRecallGain: 0.05,
    maximumAdditionalFalsePositives: 0,
    minimumNormalizedCaptureRecall: 0.2,
    requireNormalizedCaptureNotWorseThanFrozen: true,
  }),
});

const SAFE_IMAGE_PATH = /^images\/[0-9a-f-]{36}\.jpg$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const developmentKeys = report => {
  if (
    !isRecord(report)
    || report.study !== 'crop-local-card-recall-mtg-development'
    || !Array.isArray(report.sourceProvenance)
  ) throw new Error('development exclusion must be the retained MTG card development report');
  const ids = new Set();
  const names = new Set();
  const hashes = new Set();
  for (const entry of report.sourceProvenance) {
    if (typeof entry.id === 'string') ids.add(entry.id.toLowerCase());
    if (typeof entry.name === 'string') names.add(entry.name.toLowerCase());
    if (typeof entry.sha256 === 'string') hashes.add(entry.sha256);
  }
  return { ids, names, hashes };
};

export const validateMtgCardHoldoutManifest = (manifest, developmentReport) => {
  if (
    !isRecord(manifest)
    || manifest.schemaVersion !== MTG_CARD_RECALL_HOLDOUT_PROFILE.schemaVersion
    || manifest.corpus !== MTG_CARD_RECALL_HOLDOUT_PROFILE.corpus
    || manifest.policy !== MTG_CARD_RECALL_HOLDOUT_PROFILE.policy
  ) throw new Error('manifest must use the frozen MTG card holdout contract');
  if (!isRecord(manifest.selection)) throw new TypeError('MTG holdout selection must be an object');
  const selection = manifest.selection;
  if (
    selection.seed !== MTG_CARD_RECALL_HOLDOUT_PROFILE.selectionSeed
    || selection.sourcesPerEra !== MTG_CARD_RECALL_HOLDOUT_PROFILE.sourcesPerEra
    || selection.totalSources !== MTG_CARD_RECALL_HOLDOUT_PROFILE.totalSources
    || JSON.stringify(selection.transformations) !== JSON.stringify(MTG_CARD_RECALL_HOLDOUT_PROFILE.transformations)
    || selection.totalPositivePairs !== MTG_CARD_RECALL_HOLDOUT_PROFILE.totalPositivePairs
    || JSON.stringify(selection.negativePairings) !== JSON.stringify(MTG_CARD_RECALL_HOLDOUT_PROFILE.negativePairings)
    || selection.totalNegativePairs !== MTG_CARD_RECALL_HOLDOUT_PROFILE.totalNegativePairs
    || JSON.stringify(selection.gate) !== JSON.stringify(MTG_CARD_RECALL_HOLDOUT_PROFILE.gate)
    || typeof selection.developmentReportSha256 !== 'string'
    || !SHA256_PATTERN.test(selection.developmentReportSha256)
  ) throw new Error('MTG holdout selection does not match the frozen contract');
  if (!Array.isArray(manifest.images) || manifest.images.length !== 100) {
    throw new Error('MTG holdout manifest must contain exactly 100 images');
  }
  const excluded = developmentKeys(developmentReport);
  const ids = new Set();
  const names = new Set();
  const oracleIds = new Set();
  const illustrationIds = new Set();
  const hashes = new Set();
  const eraCounts = new Map(MTG_CARD_HOLDOUT_ERAS.map(({ id }) => [id, 0]));
  for (const image of manifest.images) {
    if (!isRecord(image)) throw new TypeError('MTG holdout images must be objects');
    if (
      typeof image.id !== 'string' || !UUID_PATTERN.test(image.id)
      || typeof image.oracleId !== 'string' || !UUID_PATTERN.test(image.oracleId)
      || typeof image.illustrationId !== 'string' || !UUID_PATTERN.test(image.illustrationId)
      || typeof image.name !== 'string' || image.name.length === 0
      || typeof image.set !== 'string' || !/^[A-Z0-9]{2,6}$/u.test(image.set)
      || typeof image.collectorNumber !== 'string' || image.collectorNumber.length === 0
      || typeof image.file !== 'string' || !SAFE_IMAGE_PATH.test(image.file)
      || typeof image.sha256 !== 'string' || !SHA256_PATTERN.test(image.sha256)
      || !Number.isSafeInteger(image.byteLength) || image.byteLength <= 0 || image.byteLength > 6 * 1024 * 1024
      || !Number.isSafeInteger(image.width) || image.width < 200
      || !Number.isSafeInteger(image.height) || image.height < 280
      || typeof image.scryfallURL !== 'string' || !image.scryfallURL.startsWith('https://scryfall.com/card/')
      || typeof image.imageURL !== 'string' || !image.imageURL.startsWith('https://cards.scryfall.io/')
      || image.sourceType !== 'scryfall-normal-jpeg'
      || image.rights !== 'Wizards of the Coast card image; local research fixture, not redistributed'
      || !eraCounts.has(image.era)
    ) throw new Error(`invalid MTG holdout image provenance: ${image.id ?? 'unknown'}`);
    const lowerId = image.id.toLowerCase();
    const lowerName = image.name.toLowerCase();
    if (
      ids.has(lowerId) || names.has(lowerName) || oracleIds.has(image.oracleId)
      || illustrationIds.has(image.illustrationId) || hashes.has(image.sha256)
    ) throw new Error(`duplicate MTG holdout identity: ${image.id}`);
    if (
      excluded.ids.has(lowerId) || excluded.names.has(lowerName) || excluded.hashes.has(image.sha256)
    ) throw new Error(`MTG holdout source overlaps development data: ${image.id}`);
    ids.add(lowerId);
    names.add(lowerName);
    oracleIds.add(image.oracleId);
    illustrationIds.add(image.illustrationId);
    hashes.add(image.sha256);
    eraCounts.set(image.era, eraCounts.get(image.era) + 1);
  }
  for (const [era, count] of eraCounts) {
    if (count !== 25) throw new Error(`MTG holdout era ${era} must contain exactly 25 images`);
  }
  return manifest;
};

export const buildMtgCardHoldoutManifest = ({
  images,
  developmentReport,
  developmentReportSha256,
  createdAt,
  acquisition,
}) => validateMtgCardHoldoutManifest({
  schemaVersion: MTG_CARD_RECALL_HOLDOUT_PROFILE.schemaVersion,
  corpus: MTG_CARD_RECALL_HOLDOUT_PROFILE.corpus,
  policy: MTG_CARD_RECALL_HOLDOUT_PROFILE.policy,
  createdAt,
  selection: {
    seed: MTG_CARD_RECALL_HOLDOUT_PROFILE.selectionSeed,
    eras: MTG_CARD_HOLDOUT_ERAS,
    sourcesPerEra: MTG_CARD_RECALL_HOLDOUT_PROFILE.sourcesPerEra,
    totalSources: MTG_CARD_RECALL_HOLDOUT_PROFILE.totalSources,
    transformations: MTG_CARD_RECALL_HOLDOUT_PROFILE.transformations,
    totalPositivePairs: MTG_CARD_RECALL_HOLDOUT_PROFILE.totalPositivePairs,
    negativePairings: MTG_CARD_RECALL_HOLDOUT_PROFILE.negativePairings,
    totalNegativePairs: MTG_CARD_RECALL_HOLDOUT_PROFILE.totalNegativePairs,
    gate: MTG_CARD_RECALL_HOLDOUT_PROFILE.gate,
    developmentReportSha256,
    sourceUniqueness: ['printing-id', 'oracle-id', 'illustration-id', 'name', 'encoded-sha256'],
  },
  acquisition,
  redistribution: 'Source pixels and generated transformations remain local-only; retained reports contain metadata and hashes only.',
  images,
}, developmentReport);

const crop = (source, left, top, right, bottom) => {
  const x = Math.floor(source.width * left);
  const y = Math.floor(source.height * top);
  const width = source.width - x - Math.ceil(source.width * right);
  const height = source.height - y - Math.ceil(source.height * bottom);
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const normalizedCapture = (source, identity) => {
  const seed = createHash('sha256').update(identity).digest();
  const cropped = crop(
    source,
    (4 + seed[0] % 5) / 100,
    (3 + seed[1] % 5) / 100,
    (7 + seed[2] % 6) / 100,
    (6 + seed[3] % 6) / 100,
  );
  const scalePermille = 680 + seed[4] % 121;
  const width = Math.max(64, Math.round(cropped.width * scalePermille / 1000));
  const height = Math.max(64, Math.round(cropped.height * scalePermille / 1000));
  const resized = new Uint8Array(width * height * 4);
  const gains = [870 + seed[5] % 181, 880 + seed[6] % 161, 870 + seed[7] % 181];
  const offset = (seed[8] % 17) - 8;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(cropped.height - 1, Math.floor((y + 0.5) * cropped.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(cropped.width - 1, Math.floor((x + 0.5) * cropped.width / width));
      const input = (sourceY * cropped.width + sourceX) * 4;
      const output = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        resized[output + channel] = Math.max(0, Math.min(255, Math.round(
          cropped.data[input + channel] * gains[channel] / 1000 + offset,
        )));
      }
      resized[output + 3] = 255;
    }
  }
  const blurred = new Uint8Array(resized.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const output = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let count = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
            sum += resized[(sampleY * width + sampleX) * 4 + channel];
            count += 1;
          }
        }
        blurred[output + channel] = Math.round(sum / count);
      }
      blurred[output + 3] = 255;
    }
  }
  return { format: 'rgba8', width, height, data: blurred };
};

export const transformMtgCardHoldout = (source, mode, identity) => {
  if (mode === 'center' || mode === 'severe') return transformCropLocalCalibration(source, mode);
  if (mode === 'normalized-capture') return normalizedCapture(source, identity);
  throw new RangeError(`unsupported MTG card holdout transformation: ${mode}`);
};

export const createMtgCardHoldoutPairs = sources => {
  if (!Array.isArray(sources) || sources.length !== 100) {
    throw new Error('MTG card holdout pairing requires exactly 100 sources');
  }
  const pairs = sources.flatMap(source => MTG_CARD_RECALL_HOLDOUT_PROFILE.transformations.map(mode => ({
    left: `${source.id}:original`,
    right: `${source.id}:${mode}`,
    positive: true,
    transformation: mode,
    era: source.era,
  })));
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      for (const [leftVariant, rightVariant] of MTG_CARD_RECALL_HOLDOUT_PROFILE.negativePairings) {
        pairs.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          transformation: `${leftVariant}::${rightVariant}`,
          era: null,
        });
      }
    }
  }
  return pairs;
};
