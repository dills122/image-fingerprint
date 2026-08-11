const DOMAINS = ['photograph', 'portrait', 'document', 'screenshot', 'card-layout'];
const COMMONS_DOMAINS = new Set(['photograph', 'portrait', 'document']);
const SYNTHETIC_DOMAINS = new Set(['screenshot', 'card-layout']);
const SOURCES_PER_DOMAIN = 100;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_IMAGE_PATH = /^images\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png)$/u;

export const CROP_LOCAL_CALIBRATION_PROFILE = Object.freeze({
  schemaVersion: 1,
  corpus: 'crop-local-independent-calibration-v1',
  policy: 'locked-development-profile',
  syntheticStyle: 3,
  minimumExcludedCorpora: 2,
  domains: Object.freeze([...DOMAINS]),
  sourcesPerDomain: SOURCES_PER_DOMAIN,
  totalSources: DOMAINS.length * SOURCES_PER_DOMAIN,
  transformations: Object.freeze(['center', 'asymmetric', 'severe']),
  totalTransformations: DOMAINS.length * SOURCES_PER_DOMAIN * 3,
});

export const CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE = Object.freeze({
  schemaVersion: 1,
  corpus: 'crop-local-item-color-holdout-v1',
  policy: 'locked-item-color-profile',
  syntheticStyle: 4,
  minimumExcludedCorpora: 3,
  domains: Object.freeze([...DOMAINS]),
  sourcesPerDomain: SOURCES_PER_DOMAIN,
  totalSources: DOMAINS.length * SOURCES_PER_DOMAIN,
  transformations: Object.freeze(['center', 'asymmetric', 'severe']),
  totalTransformations: DOMAINS.length * SOURCES_PER_DOMAIN * 3,
});

const CROP_LOCAL_CORPUS_PROFILES = new Map([
  [CROP_LOCAL_CALIBRATION_PROFILE.corpus, CROP_LOCAL_CALIBRATION_PROFILE],
  [CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE.corpus, CROP_LOCAL_ITEM_COLOR_HOLDOUT_PROFILE],
]);

export const summarizeCropLocalMeasurements = (values) => {
  if (!Array.isArray(values)) throw new TypeError('measurement values must be an array');
  if (values.length === 0) return { count: 0, p50: null, p95: null, maximum: null };
  const ordered = [...values].sort((left, right) => left - right);
  const percentile = fraction => ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) maximum = Math.max(maximum, value);
  return { count: values.length, p50: percentile(0.5), p95: percentile(0.95), maximum };
};

export const compactCropLocalCalibrationReport = (report) => {
  if (
    !isRecord(report)
    || report.study !== 'crop-local-multiscale-binary-v0-typescript-independent-calibration'
    || !Array.isArray(report.sourceProvenance)
    || !Array.isArray(report.selectedFalsePositiveEvidence)
  ) throw new Error('input must be a completed Crop-Local independent calibration report');
  const falsePositives = report.selectedFalsePositiveEvidence;
  const domainPairs = [...new Set(falsePositives.map(({ domainPair }) => domainPair))].sort();
  const variantPair = ({ left, right }) => (
    `${left.slice(left.lastIndexOf(':') + 1)}::${right.slice(right.lastIndexOf(':') + 1)}`
  );
  const variantPairs = [...new Set(falsePositives.map(variantPair))].sort();
  const representative = domainPairs.flatMap(domainPair => (
    falsePositives.filter(entry => entry.domainPair === domainPair).slice(0, 5)
  ));
  const { selectedFalsePositiveEvidence: _evidence, sourceManifest: _sourceManifest, ...compact } = report;
  return {
    ...compact,
    sourceManifest: 'local-only/crop-local-independent-calibration-v1/manifest.json',
    falsePositiveEvidence: {
      count: falsePositives.length,
      byDomainPair: Object.fromEntries(domainPairs.map(domainPair => [
        domainPair,
        falsePositives.filter(entry => entry.domainPair === domainPair).length,
      ])),
      byVariantPair: Object.fromEntries(variantPairs.map(pair => [
        pair,
        falsePositives.filter(entry => variantPair(entry) === pair).length,
      ])),
      representative,
    },
    decision: {
      publicProfile: 'blocked',
      thresholdsRetunedOnCalibration: false,
      reason: 'The locked false-positive rate exceeds the predeclared maximum.',
    },
  };
};

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const sourceIdentity = (image) => {
  const output = [`id:${image.id}`, `sha256:${image.sha256}`];
  if (Number.isSafeInteger(image.pageId)) output.push(`commons-page:${image.pageId}`);
  if (
    image.sourceType === 'deterministic-generated'
    && typeof image.generator === 'string'
    && Number.isSafeInteger(image.seed)
    && Number.isSafeInteger(image.style)
  ) {
    output.push(`generated:${image.generator}:${image.domain}:${image.style}:${image.seed}`);
  }
  return output;
};

export const collectExcludedCropLocalSourceKeys = (manifests) => {
  if (!Array.isArray(manifests)) throw new TypeError('excluded manifests must be an array');
  const keys = new Set();
  for (const manifest of manifests) {
    if (!isRecord(manifest) || !Array.isArray(manifest.images)) {
      throw new TypeError('each excluded manifest must contain an images array');
    }
    for (const image of manifest.images) {
      if (!isRecord(image)) throw new TypeError('excluded manifest images must be objects');
      for (const key of sourceIdentity(image)) keys.add(key);
    }
  }
  return keys;
};

const validateImage = (image, index, profile) => {
  if (!isRecord(image)) throw new TypeError(`calibration image ${index} must be an object`);
  if (typeof image.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,100}$/u.test(image.id)) {
    throw new Error(`calibration image ${index} id must be canonical kebab-case text`);
  }
  if (!DOMAINS.includes(image.domain)) {
    throw new Error(`calibration image ${image.id} has an unsupported domain`);
  }
  if (typeof image.file !== 'string' || !SAFE_IMAGE_PATH.test(image.file) || image.file.includes('..')) {
    throw new Error(`calibration image ${image.id} file must stay under images`);
  }
  if (!Number.isSafeInteger(image.byteLength) || image.byteLength <= 0 || image.byteLength > 8 * 1024 * 1024) {
    throw new Error(`calibration image ${image.id} byte length must be from 1 through 8388608`);
  }
  if (typeof image.sha256 !== 'string' || !SHA256_PATTERN.test(image.sha256)) {
    throw new Error(`calibration image ${image.id} sha256 must be canonical lowercase hex`);
  }
  if (typeof image.license !== 'string' || image.license.length === 0) {
    throw new Error(`calibration image ${image.id} must record its license`);
  }
  if (COMMONS_DOMAINS.has(image.domain)) {
    if (
      image.sourceType !== 'wikimedia-commons'
      || !Number.isSafeInteger(image.pageId) || image.pageId <= 0
      || !Number.isSafeInteger(image.width) || image.width < 64
      || !Number.isSafeInteger(image.height) || image.height < 64
      || typeof image.descriptionURL !== 'string' || !image.descriptionURL.startsWith('https://')
      || typeof image.imageURL !== 'string' || !image.imageURL.startsWith('https://')
      || typeof image.apiQueryURL !== 'string' || !image.apiQueryURL.startsWith('https://')
    ) {
      throw new Error(`calibration image ${image.id} must include complete Commons provenance`);
    }
  } else if (SYNTHETIC_DOMAINS.has(image.domain)) {
    if (
      image.sourceType !== 'deterministic-generated'
      || image.generator !== 'benchmarks/crop-local/prepare-calibration-corpus.mjs'
      || !Number.isSafeInteger(image.seed) || image.seed < 0
      || image.style !== profile.syntheticStyle
    ) {
      throw new Error(`calibration image ${image.id} must use the independent style-${profile.syntheticStyle} generator`);
    }
  }
};

const validateExclusions = (exclusions, profile) => {
  if (!Array.isArray(exclusions) || exclusions.length < profile.minimumExcludedCorpora) {
    throw new Error(`calibration requires at least ${profile.minimumExcludedCorpora} excluded source manifests`);
  }
  const corpora = new Set();
  for (const exclusion of exclusions) {
    if (
      !isRecord(exclusion)
      || typeof exclusion.corpus !== 'string' || exclusion.corpus.length === 0
      || typeof exclusion.manifestSha256 !== 'string'
      || !SHA256_PATTERN.test(exclusion.manifestSha256)
      || !isRecord(exclusion.manifest)
      || exclusion.manifest.corpus !== exclusion.corpus
    ) {
      throw new Error('calibration exclusions must include corpus, manifest SHA-256, and manifest');
    }
    if (corpora.has(exclusion.corpus)) throw new Error(`duplicate excluded corpus: ${exclusion.corpus}`);
    corpora.add(exclusion.corpus);
  }
};

export const buildCropLocalCalibrationManifest = ({
  images,
  exclusions,
  commonsStartOffset,
  syntheticSeedOffset,
  createdAt,
  profile = CROP_LOCAL_CALIBRATION_PROFILE,
}) => {
  if (CROP_LOCAL_CORPUS_PROFILES.get(profile.corpus) !== profile) {
    throw new Error('unsupported crop-local corpus profile');
  }
  validateExclusions(exclusions, profile);
  if (!Number.isSafeInteger(commonsStartOffset) || commonsStartOffset < 0) {
    throw new RangeError('Commons start offset must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(syntheticSeedOffset) || syntheticSeedOffset < 0) {
    throw new RangeError('synthetic seed offset must be a non-negative safe integer');
  }
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('calibration creation time must be an ISO timestamp');
  }
  const manifest = {
    schemaVersion: profile.schemaVersion,
    corpus: profile.corpus,
    createdAt,
    policy: profile.policy,
    selection: {
      domains: [...profile.domains],
      sourcesPerDomain: profile.sourcesPerDomain,
      totalSources: profile.totalSources,
      commonsLicenseAllowlist: ['Public domain', 'CC0'],
      commonsRestrictionsRequiredEmpty: true,
      commonsStartOffset,
      syntheticSeedOffset,
      syntheticStyle: profile.syntheticStyle,
      transformations: [...profile.transformations],
      transformationsPerSource: profile.transformations.length,
      totalTransformations: profile.totalTransformations,
      excludedCorpora: exclusions.map(({ corpus, manifestSha256 }) => ({
        corpus,
        manifestSha256,
      })),
    },
    sources: {
      commons: {
        api: 'https://commons.wikimedia.org/w/api.php',
        reuseGuidance: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
      },
      synthetic: {
        generator: 'benchmarks/crop-local/prepare-calibration-corpus.mjs',
        style: profile.syntheticStyle,
        license: 'CC0-1.0',
      },
    },
    redistribution: 'Source pixels and generated transformations remain local-only; retained reports contain metadata and hashes only.',
    images,
  };
  return validateCropLocalCalibrationManifest(
    manifest,
    exclusions.map(({ manifest: excluded }) => excluded),
    profile,
  );
};

export const validateCropLocalCalibrationManifest = (
  manifest,
  excludedManifests = [],
  expectedProfile,
) => {
  const profile = expectedProfile ?? CROP_LOCAL_CORPUS_PROFILES.get(manifest?.corpus);
  if (
    profile === undefined
    || !isRecord(manifest)
    || manifest.schemaVersion !== profile.schemaVersion
    || manifest.corpus !== profile.corpus
    || manifest.policy !== profile.policy
  ) {
    throw new Error('manifest must use a locked crop-local corpus contract');
  }
  if (!isRecord(manifest.selection)) throw new TypeError('calibration selection must be an object');
  const selection = manifest.selection;
  if (
    JSON.stringify(selection.domains) !== JSON.stringify(profile.domains)
    || selection.sourcesPerDomain !== profile.sourcesPerDomain
    || selection.totalSources !== profile.totalSources
    || JSON.stringify(selection.transformations) !== JSON.stringify(profile.transformations)
    || selection.transformationsPerSource !== profile.transformations.length
    || selection.totalTransformations !== profile.totalTransformations
    || selection.syntheticStyle !== profile.syntheticStyle
  ) {
    throw new Error('calibration selection does not match the frozen 500-source/1,500-transformation profile');
  }
  if (
    !Array.isArray(selection.excludedCorpora)
    || selection.excludedCorpora.length < profile.minimumExcludedCorpora
  ) {
    throw new Error(`calibration selection must retain at least ${profile.minimumExcludedCorpora} excluded corpora`);
  }
  if (!Array.isArray(manifest.images) || manifest.images.length !== profile.totalSources) {
    throw new Error(`calibration manifest must contain exactly ${profile.totalSources} images`);
  }
  const ids = new Set();
  const hashes = new Set();
  const pageIds = new Set();
  const generated = new Set();
  const domainCounts = new Map(DOMAINS.map(domain => [domain, 0]));
  const excludedKeys = collectExcludedCropLocalSourceKeys(excludedManifests);
  manifest.images.forEach((image, index) => {
    validateImage(image, index, profile);
    if (ids.has(image.id)) throw new Error(`duplicate calibration image id: ${image.id}`);
    if (hashes.has(image.sha256)) throw new Error(`duplicate calibration image sha256: ${image.sha256}`);
    ids.add(image.id);
    hashes.add(image.sha256);
    domainCounts.set(image.domain, domainCounts.get(image.domain) + 1);
    if (Number.isSafeInteger(image.pageId)) {
      if (pageIds.has(image.pageId)) throw new Error(`duplicate Commons page ID: ${image.pageId}`);
      pageIds.add(image.pageId);
    }
    if (image.sourceType === 'deterministic-generated') {
      const key = `${image.generator}:${image.domain}:${image.style}:${image.seed}`;
      if (generated.has(key)) throw new Error(`duplicate generated source: ${key}`);
      generated.add(key);
    }
    const overlap = sourceIdentity(image).find(key => excludedKeys.has(key));
    if (overlap !== undefined) throw new Error(`calibration image ${image.id} overlaps development data: ${overlap}`);
  });
  for (const domain of DOMAINS) {
    if (domainCounts.get(domain) !== SOURCES_PER_DOMAIN) {
      throw new Error(`calibration domain ${domain} must contain exactly ${SOURCES_PER_DOMAIN} images`);
    }
  }
  return manifest;
};

export const createCropLocalCalibrationPairs = (sources) => {
  if (!Array.isArray(sources) || sources.length !== CROP_LOCAL_CALIBRATION_PROFILE.totalSources) {
    throw new Error('calibration pairing requires exactly 500 sources');
  }
  const pairs = [];
  for (const source of sources) {
    for (const mode of CROP_LOCAL_CALIBRATION_PROFILE.transformations) {
      pairs.push({
        left: `${source.id}:original`,
        right: `${source.id}:${mode}`,
        positive: true,
        domain: source.domain,
      });
    }
  }
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      const variants = [['original', 'original']];
      if (
        sources[left].domain === sources[right].domain
        && ['screenshot', 'card-layout'].includes(sources[left].domain)
      ) variants.push(['original', 'asymmetric'], ['asymmetric', 'asymmetric']);
      for (const [leftVariant, rightVariant] of variants) {
        pairs.push({
          left: `${sources[left].id}:${leftVariant}`,
          right: `${sources[right].id}:${rightVariant}`,
          positive: false,
          domain: null,
          domainPair: [sources[left].domain, sources[right].domain].sort().join('::'),
        });
      }
    }
  }
  return pairs;
};

const crop = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

export const transformCropLocalCalibration = (source, mode) => {
  if (
    !isRecord(source)
    || source.format !== 'rgba8'
    || !Number.isSafeInteger(source.width) || source.width < 64
    || !Number.isSafeInteger(source.height) || source.height < 64
    || !(source.data instanceof Uint8Array)
    || source.data.length !== source.width * source.height * 4
  ) {
    throw new RangeError('calibration transformations require rgba8 pixels of at least 64x64');
  }
  if (mode === 'center') {
    const width = Math.max(40, Math.floor(source.width * 0.7));
    const height = Math.max(40, Math.floor(source.height * 0.7));
    return crop(
      source,
      Math.floor((source.width - width) / 2),
      Math.floor((source.height - height) / 2),
      width,
      height,
    );
  }
  if (mode === 'asymmetric') {
    const width = Math.max(40, Math.floor(source.width * 0.62));
    const height = Math.max(40, Math.floor(source.height * 0.82));
    return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
  }
  if (mode === 'severe') {
    const width = Math.max(40, Math.floor(source.width * 0.5));
    const height = Math.max(40, Math.floor(source.height * 0.65));
    return crop(
      source,
      source.width - width,
      Math.floor((source.height - height) / 4),
      width,
      height,
    );
  }
  throw new RangeError(`unsupported crop-local calibration transformation: ${mode}`);
};
