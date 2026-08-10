import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCropLocalCalibrationManifest,
  collectExcludedCropLocalSourceKeys,
  CROP_LOCAL_CALIBRATION_PROFILE,
} from './calibration-corpus.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const COMMONS_DOMAINS = [
  {
    domain: 'photograph',
    searches: [
      'landscape photograph public domain',
      'street photograph public domain',
      'architecture photograph public domain',
    ],
  },
  {
    domain: 'portrait',
    searches: [
      'historical portrait photograph public domain',
      'painted portrait public domain',
      'engraved portrait public domain',
    ],
  },
  {
    domain: 'document',
    searches: [
      'scanned document public domain',
      'manuscript public domain',
      'historical map public domain',
      'newspaper page public domain',
      'book page public domain',
      'patent drawing public domain',
    ],
  },
];
const SYNTHETIC_DOMAINS = ['screenshot', 'card-layout'];
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'image-fingerprint-crop-local-calibration/0.1 (https://github.com/dills122/image-fingerprint)';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROGRESS_FILE = '.crop-local-calibration-progress.json';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const parseArguments = (arguments_) => {
  const normalizedArguments = arguments_.filter(argument => argument !== '--');
  if (normalizedArguments.length === 1 && normalizedArguments[0] === '--plan-only') {
    return { planOnly: true };
  }
  let output;
  let commonsStartOffset = 2_000;
  let syntheticSeedOffset = 100_000;
  const exclusions = [];
  for (let index = 0; index < normalizedArguments.length; index += 1) {
    if (normalizedArguments[index] === '--output') {
      output = resolve(normalizedArguments[index += 1]);
    } else if (normalizedArguments[index] === '--exclude-manifest') {
      exclusions.push({ kind: 'manifest', path: resolve(normalizedArguments[index += 1]) });
    } else if (normalizedArguments[index] === '--exclude-evidence') {
      exclusions.push({ kind: 'evidence', path: resolve(normalizedArguments[index += 1]) });
    } else if (normalizedArguments[index] === '--commons-start-offset') {
      commonsStartOffset = Number(normalizedArguments[index += 1]);
    } else if (normalizedArguments[index] === '--synthetic-seed-offset') {
      syntheticSeedOffset = Number(normalizedArguments[index += 1]);
    } else {
      throw new Error('Usage: prepare-calibration-corpus.mjs --output DIR (--exclude-manifest FILE|--exclude-evidence FILE) ... [--commons-start-offset N] [--synthetic-seed-offset N]');
    }
  }
  if (
    output === undefined
    || exclusions.length < 2
    || new Set(exclusions.map(({ path }) => path)).size !== exclusions.length
    || !Number.isSafeInteger(commonsStartOffset) || commonsStartOffset < 0
    || !Number.isSafeInteger(syntheticSeedOffset) || syntheticSeedOffset < 0
  ) {
    throw new Error('Invalid crop-local calibration corpus arguments');
  }
  const repositoryRelative = relative(REPOSITORY_ROOT, output);
  if (repositoryRelative === '' || (!repositoryRelative.startsWith('..') && !isAbsolute(repositoryRelative))) {
    throw new Error('Calibration source pixels must be written outside the repository');
  }
  return {
    planOnly: false,
    output,
    commonsStartOffset,
    syntheticSeedOffset,
    exclusions,
  };
};

const delay = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

const fetchChecked = async (url) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await delay(350);
    let response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === 4) throw error;
      await delay(Math.min(1000 * 2 ** attempt, 15_000));
      continue;
    }
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** attempt;
    await delay(Math.min(backoff, 15_000));
  }
  throw new Error(`Retry limit exceeded for ${url}`);
};

const field = (metadata, name) => metadata?.[name]?.value ?? '';

const acceptedLicense = (metadata) => {
  const name = field(metadata, 'LicenseShortName').toLowerCase();
  const restrictions = field(metadata, 'Restrictions').trim();
  return restrictions === '' && (name.includes('public domain') || name === 'cc0');
};

const commonsSearchUrl = (search, offset) => {
  const query = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: search,
    gsrnamespace: '6',
    gsrlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '900',
    format: 'json',
    formatversion: '2',
  });
  query.set('gsroffset', String(offset));
  return `${API}?${query}`;
};

const readExclusions = async (inputs) => Promise.all(inputs.map(async ({ kind, path }) => {
  const bytes = await readFile(path);
  const payload = JSON.parse(bytes.toString('utf8'));
  if (kind === 'evidence') {
    if (
      typeof payload.developmentCorpus !== 'string'
      || !Array.isArray(payload.sourceProvenance)
      || typeof payload.manifestSha256 !== 'string'
      || !/^[0-9a-f]{64}$/u.test(payload.manifestSha256)
    ) {
      throw new Error(`Excluded evidence is missing development corpus provenance: ${path}`);
    }
    return {
      path,
      corpus: payload.developmentCorpus,
      manifestSha256: payload.manifestSha256,
      evidenceSha256: sha256(bytes),
      manifest: { corpus: payload.developmentCorpus, images: payload.sourceProvenance },
    };
  }
  if (typeof payload.corpus !== 'string' || !Array.isArray(payload.images)) {
    throw new Error(`Excluded manifest is missing corpus/images: ${path}`);
  }
  return { path, corpus: payload.corpus, manifestSha256: sha256(bytes), manifest: payload };
}));

const progressSignature = options => sha256(JSON.stringify({
  corpus: CROP_LOCAL_CALIBRATION_PROFILE.corpus,
  commonsStartOffset: options.commonsStartOffset,
  syntheticSeedOffset: options.syntheticSeedOffset,
  exclusions: options.exclusions.map(({ corpus, manifestSha256 }) => ({ corpus, manifestSha256 })),
}));

const readProgress = async (output, signature) => {
  try {
    const progress = JSON.parse(await readFile(join(output, PROGRESS_FILE), 'utf8'));
    if (progress.schemaVersion !== 1 || progress.signature !== signature || !Array.isArray(progress.images)) {
      throw new Error('Existing calibration progress does not match the requested selection');
    }
    for (const image of progress.images) {
      const bytes = await readFile(join(output, image.file));
      if (bytes.length !== image.byteLength || sha256(bytes) !== image.sha256) {
        throw new Error(`Calibration progress checksum mismatch: ${image.file}`);
      }
    }
    return progress;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { schemaVersion: 1, signature, nextOffsetByDomain: {}, images: [] };
  }
};

const writeProgress = async (output, progress) => {
  await writeFile(join(output, PROGRESS_FILE), `${JSON.stringify(progress, null, 2)}\n`);
};

const downloadCommonsDomains = async (options, progress, excludedKeys) => {
  const seenPageIds = new Set(progress.images.flatMap(image => (
    Number.isSafeInteger(image.pageId) ? [image.pageId] : []
  )));
  const seenHashes = new Set(progress.images.map(({ sha256: hash }) => hash));
  for (const { domain, searches } of COMMONS_DOMAINS) {
    let selected = progress.images.filter(image => image.domain === domain).length;
    for (let searchIndex = 0; searchIndex < searches.length; searchIndex += 1) {
      if (selected >= CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain) break;
      const search = searches[searchIndex];
      const progressKey = searchIndex === 0 ? domain : `${domain}:${searchIndex}`;
      let offset = progress.nextOffsetByDomain[progressKey] ?? options.commonsStartOffset;
      for (let page = 0; page < 40 && selected < CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain; page += 1) {
        const apiUrl = commonsSearchUrl(search, offset);
        const payload = await (await fetchChecked(apiUrl)).json();
        for (const item of payload.query?.pages ?? []) {
          if (selected >= CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain) break;
          const information = item.imageinfo?.[0];
          if (
            seenPageIds.has(item.pageid)
            || excludedKeys.has(`commons-page:${item.pageid}`)
            || information === undefined
            || !acceptedLicense(information.extmetadata)
            || !['image/jpeg', 'image/png'].includes(information.mime)
            || information.thumburl === undefined
            || information.thumbwidth < 64
            || information.thumbheight < 64
          ) continue;
          const response = await fetchChecked(information.thumburl);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const hash = sha256(bytes);
          if (
            bytes.length === 0 || bytes.length > 8 * 1024 * 1024
            || seenHashes.has(hash) || excludedKeys.has(`sha256:${hash}`)
          ) continue;
          const extension = information.mime === 'image/png' ? 'png' : 'jpg';
          const file = `images/${domain}-commons-${item.pageid}.${extension}`;
          await writeFile(join(options.output, file), bytes);
          const image = {
            id: `${domain}-commons-${item.pageid}`,
            domain,
            sourceType: 'wikimedia-commons',
            title: item.title,
            pageId: item.pageid,
            descriptionURL: information.descriptionurl,
            imageURL: information.thumburl,
            apiQueryURL: apiUrl,
            file,
            width: information.thumbwidth,
            height: information.thumbheight,
            byteLength: bytes.length,
            sha256: hash,
            license: field(information.extmetadata, 'LicenseShortName'),
            licenseURL: field(information.extmetadata, 'LicenseUrl') || null,
            attributionRequired: field(information.extmetadata, 'AttributionRequired') === 'true',
          };
          progress.images.push(image);
          seenPageIds.add(item.pageid);
          seenHashes.add(hash);
          selected += 1;
          await writeProgress(options.output, progress);
        }
        const nextOffset = payload.continue?.gsroffset;
        if (nextOffset === undefined) break;
        offset = nextOffset;
        progress.nextOffsetByDomain[progressKey] = offset;
        await writeProgress(options.output, progress);
      }
    }
    if (selected < CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain) {
      throw new Error(`Only found ${selected}/${CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain} eligible ${domain} Commons images`);
    }
  }
};

const paintRectangle = (image, x, y, width, height, color) => {
  for (let row = Math.max(0, y); row < Math.min(image.height, y + height); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(image.width, x + width); column += 1) {
      const index = (row * image.width + column) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }
};

const createSynthetic = (domain, seed) => {
  const width = domain === 'screenshot' ? 1100 : 820;
  const height = domain === 'screenshot' ? 760 : 1120;
  const image = new PNG({ width, height, colorType: 6 });
  let state = ((seed + 1) * 0x9e37_79b1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  if (domain === 'screenshot') {
    paintRectangle(image, 0, 0, width, height, [246, 241, 234]);
    paintRectangle(image, 0, 0, width, 76, [28, 38 + seed % 40, 62]);
    paintRectangle(image, 0, 76, 248, height - 76, [218, 226, 232]);
    for (let section = 0; section < 8; section += 1) {
      paintRectangle(image, 30, 112 + section * 72, 110 + random() % 85, 12, [82, 102, 122]);
      paintRectangle(image, 30, 134 + section * 72, 65 + random() % 120, 7, [150, 165, 178]);
    }
    for (let panel = 0; panel < 9; panel += 1) {
      const x = 280 + (panel % 3) * 265;
      const y = 108 + Math.floor(panel / 3) * 205;
      paintRectangle(image, x, y, 232, 174, [255, 255, 255]);
      paintRectangle(image, x + 16, y + 16, 52, 52, [50 + random() % 180, 50 + random() % 180, 50 + random() % 180]);
      for (let line = 0; line < 5; line += 1) {
        paintRectangle(image, x + 82, y + 18 + line * 23, 70 + random() % 120, 8, [90 + line * 12, 105, 125]);
      }
      paintRectangle(image, x + 16, y + 132, 70 + random() % 135, 18, [35 + random() % 180, 110, 95]);
    }
  } else {
    paintRectangle(image, 0, 0, width, height, [25, 30, 42]);
    paintRectangle(image, 34, 34, width - 68, height - 68, [225 + seed % 20, 218, 194]);
    paintRectangle(image, 76, 80, width - 152, 126, [45 + random() % 160, 45 + random() % 160, 65 + random() % 150]);
    paintRectangle(image, 92, 236, width - 184, 420, [35 + random() % 200, 45 + random() % 190, 55 + random() % 180]);
    for (let marker = 0; marker < 7; marker += 1) {
      paintRectangle(image, 112 + marker * 86, 680, 48, 48, [55 + random() % 180, 65 + random() % 170, 75 + random() % 160]);
    }
    for (let line = 0; line < 11; line += 1) {
      paintRectangle(image, 92, 770 + line * 25, 250 + random() % 390, 9, [50, 47 + line * 2, 44]);
    }
    paintRectangle(image, 92, 1062, 190 + random() % 390, 15, [85 + random() % 100, 62, 58]);
  }
  return PNG.sync.write(image, { colorType: 6 });
};

const generateSyntheticDomains = async (options, progress, excludedKeys) => {
  const seenHashes = new Set(progress.images.map(({ sha256: hash }) => hash));
  for (const domain of SYNTHETIC_DOMAINS) {
    const existing = new Set(progress.images.filter(image => image.domain === domain).map(({ seed }) => seed));
    for (let index = 0; index < CROP_LOCAL_CALIBRATION_PROFILE.sourcesPerDomain; index += 1) {
      const seed = options.syntheticSeedOffset + index;
      if (existing.has(seed)) continue;
      const generatedKey = `generated:benchmarks/crop-local/prepare-calibration-corpus.mjs:${domain}:3:${seed}`;
      if (excludedKeys.has(generatedKey)) throw new Error(`Synthetic calibration seed overlaps development data: ${seed}`);
      const bytes = createSynthetic(domain, seed);
      const hash = sha256(bytes);
      if (seenHashes.has(hash) || excludedKeys.has(`sha256:${hash}`)) {
        throw new Error(`Synthetic calibration pixels are duplicated at seed ${seed}`);
      }
      const file = `images/${domain}-generated-style3-${seed}.png`;
      await writeFile(join(options.output, file), bytes);
      progress.images.push({
        id: `${domain}-generated-style3-${seed}`,
        domain,
        sourceType: 'deterministic-generated',
        title: `${domain} deterministic calibration fixture ${seed}`,
        file,
        width: domain === 'screenshot' ? 1100 : 820,
        height: domain === 'screenshot' ? 760 : 1120,
        byteLength: bytes.length,
        sha256: hash,
        license: 'CC0-1.0',
        licenseURL: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
        generator: 'benchmarks/crop-local/prepare-calibration-corpus.mjs',
        seed,
        style: 3,
      });
      seenHashes.add(hash);
      await writeProgress(options.output, progress);
    }
  }
};

const run = async (options) => {
  await mkdir(join(options.output, 'images'), { recursive: true });
  const exclusions = await readExclusions(options.exclusions);
  const completeOptions = { ...options, exclusions };
  const signature = progressSignature(completeOptions);
  const progress = await readProgress(options.output, signature);
  const resumed = progress.images.length > 0;
  const excludedKeys = collectExcludedCropLocalSourceKeys(exclusions.map(({ manifest }) => manifest));
  await downloadCommonsDomains(completeOptions, progress, excludedKeys);
  await generateSyntheticDomains(completeOptions, progress, excludedKeys);
  progress.images.sort((left, right) => (
    CROP_LOCAL_CALIBRATION_PROFILE.domains.indexOf(left.domain)
      - CROP_LOCAL_CALIBRATION_PROFILE.domains.indexOf(right.domain)
    || left.id.localeCompare(right.id)
  ));
  const manifest = buildCropLocalCalibrationManifest({
    images: progress.images,
    exclusions,
    commonsStartOffset: options.commonsStartOffset,
    syntheticSeedOffset: options.syntheticSeedOffset,
    createdAt: new Date().toISOString(),
  });
  const manifestPath = join(options.output, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    output: options.output,
    manifest: manifestPath,
    sources: manifest.images.length,
    transformations: manifest.selection.totalTransformations,
    domains: Object.fromEntries(manifest.selection.domains.map(domain => [
      domain,
      manifest.images.filter(image => image.domain === domain).length,
    ])),
    resumed,
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly
    ? {
      ...CROP_LOCAL_CALIBRATION_PROFILE,
      commonsDomains: COMMONS_DOMAINS,
      syntheticDomains: SYNTHETIC_DOMAINS,
      requiredExcludedManifests: 2,
      sourcePixels: 'local-only-outside-repository',
      resumable: true,
    }
    : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`prepare crop-local calibration corpus: ${error.message}\n`);
  process.exitCode = 2;
}
