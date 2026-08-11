import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMtgCardHoldoutManifest,
  MTG_CARD_HOLDOUT_ERAS,
  MTG_CARD_RECALL_HOLDOUT_PROFILE,
} from './mtg-card-holdout-corpus.mjs';

const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js');

const API_ORIGIN = 'https://api.scryfall.com';
const IMAGE_ORIGIN = 'https://cards.scryfall.io';
const USER_AGENT = 'image-fingerprint-card-holdout/0.1 (+https://github.com/dills122/image-fingerprint)';
const ACCEPT_JSON = 'application/json;q=0.9,*/*;q=0.8';
const REQUEST_DELAY_MS = 150;
const MAXIMUM_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAXIMUM_IMAGE_BYTES = 6 * 1024 * 1024;
const PAGES_PER_ERA = 8;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

const parseArguments = arguments_ => {
  const normalized = arguments_.filter(argument => argument !== '--');
  if (normalized.length === 1 && normalized[0] === '--plan-only') return { planOnly: true };
  let output;
  let developmentReport;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === '--output') output = resolve(normalized[index += 1]);
    else if (normalized[index] === '--exclude-development-report') {
      developmentReport = resolve(normalized[index += 1]);
    } else {
      throw new Error('Usage: prepare-mtg-card-holdout.mjs --output DIR --exclude-development-report FILE');
    }
  }
  if (output === undefined || developmentReport === undefined) {
    throw new Error('Output and development report are required');
  }
  const repositoryRelative = relative(REPOSITORY_ROOT, output);
  if (repositoryRelative === '' || (!repositoryRelative.startsWith('..') && !isAbsolute(repositoryRelative))) {
    throw new Error('MTG holdout source pixels must be written outside the repository');
  }
  return { planOnly: false, output, developmentReport };
};

const readBounded = async (response, maximumBytes, label) => {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximumBytes) throw new Error(`${label} exceeds byte limit`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maximumBytes) throw new Error(`${label} exceeds byte limit`);
  return bytes;
};

let lastRequestAt = 0;
const request = async (url, accept) => {
  const wait = Math.max(0, REQUEST_DELAY_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await delay(wait);
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
};

const fetchJson = async url => {
  const response = await request(url, ACCEPT_JSON);
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new Error(`Expected JSON from ${url}`);
  }
  return JSON.parse(new TextDecoder().decode(await readBounded(
    response,
    MAXIMUM_RESPONSE_BYTES,
    'Scryfall response',
  )));
};

const searchUrl = era => {
  const url = new URL('/cards/search', API_ORIGIN);
  url.searchParams.set('q', `game:paper lang:en date>=${era.releasedAfter} date<=${era.releasedBefore}`);
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'released');
  url.searchParams.set('dir', 'asc');
  return url;
};

const pageSequence = (totalPages, eraIndex) => {
  let state = (MTG_CARD_RECALL_HOLDOUT_PROFILE.selectionSeed + eraIndex * 0x9e37_79b1) >>> 0;
  const output = new Set([1, totalPages]);
  while (output.size < Math.min(PAGES_PER_ERA, totalPages)) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    output.add(1 + state % totalPages);
  }
  return [...output].sort((left, right) => left - right);
};

const colorCategory = card => {
  if (/\bLand\b/u.test(card.type_line ?? '')) return 'land';
  const colors = Array.isArray(card.colors) ? card.colors : [];
  if (colors.length === 0) return 'colorless';
  if (colors.length > 1) return 'multicolor';
  return colors[0];
};

const primaryType = card => (
  ['Land', 'Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Instant', 'Sorcery', 'Battle']
    .find(type => (card.type_line ?? '').includes(type)) ?? 'Other'
);

const style = card => {
  const effects = Array.isArray(card.frame_effects) ? card.frame_effects : [];
  if (card.textless === true) return 'textless';
  if (effects.includes('showcase')) return 'showcase';
  if (effects.includes('extendedart')) return 'extended-art';
  if (card.full_art === true) return 'full-art';
  if (card.border_color === 'borderless') return 'borderless';
  return 'normal';
};

const imageUrl = card => {
  const value = card?.image_uris?.normal;
  if (typeof value !== 'string') return null;
  const url = new URL(value);
  return url.protocol === 'https:' && url.origin === IMAGE_ORIGIN ? url.href : null;
};

const normalizeCard = (card, era) => {
  const image = imageUrl(card);
  if (
    card?.object !== 'card' || card.lang !== 'en' || card.digital !== false
    || typeof card.id !== 'string' || typeof card.oracle_id !== 'string'
    || typeof card.illustration_id !== 'string' || typeof card.name !== 'string'
    || typeof card.set !== 'string' || typeof card.collector_number !== 'string'
    || typeof card.released_at !== 'string' || image === null
  ) return null;
  return {
    id: card.id.toLowerCase(),
    oracleId: card.oracle_id.toLowerCase(),
    illustrationId: card.illustration_id.toLowerCase(),
    name: card.name,
    set: card.set.toUpperCase(),
    collectorNumber: card.collector_number,
    era: era.id,
    releasedAt: card.released_at,
    layout: typeof card.layout === 'string' ? card.layout : 'unknown',
    style: style(card),
    colorCategory: colorCategory(card),
    primaryType: primaryType(card),
    rarity: typeof card.rarity === 'string' ? card.rarity : 'unknown',
    scryfallURL: card.scryfall_uri,
    imageURL: image,
  };
};

const coverageKeys = ['set', 'colorCategory', 'primaryType', 'style', 'rarity', 'layout'];
const coverageWeights = { set: 8, colorCategory: 5, primaryType: 4, style: 3, rarity: 2, layout: 2 };

const rankBalanced = candidates => {
  const remaining = candidates.map((card, index) => ({ card, index }));
  const counts = Object.fromEntries(coverageKeys.map(key => [key, new Map()]));
  const ranked = [];
  while (remaining.length > 0) {
    let best;
    for (const candidate of remaining) {
      const score = coverageKeys.reduce((sum, key) => (
        sum + coverageWeights[key] / ((counts[key].get(candidate.card[key]) ?? 0) + 1)
      ), 0);
      if (best === undefined || score > best.score || (score === best.score && candidate.index < best.index)) {
        best = { ...candidate, score };
      }
    }
    ranked.push(best.card);
    for (const key of coverageKeys) {
      counts[key].set(best.card[key], (counts[key].get(best.card[key]) ?? 0) + 1);
    }
    remaining.splice(remaining.findIndex(({ index }) => index === best.index), 1);
  }
  return ranked;
};

const collectEraCandidates = async (era, eraIndex, excluded) => {
  const base = searchUrl(era);
  const first = await fetchJson(base);
  if (first.object !== 'list' || !Array.isArray(first.data)) throw new Error('Invalid Scryfall list');
  const totalPages = Math.max(1, Math.ceil(first.total_cards / first.data.length));
  const pages = pageSequence(totalPages, eraIndex);
  const raw = [];
  for (const page of pages) {
    const payload = page === 1 ? first : await fetchJson(new URL(`${base.href}&page=${page}`));
    raw.push(...payload.data);
  }
  const ids = new Set();
  const names = new Set();
  const oracles = new Set();
  const illustrations = new Set();
  const candidates = [];
  for (const rawCard of raw) {
    const card = normalizeCard(rawCard, era);
    if (
      card === null || excluded.ids.has(card.id) || excluded.names.has(card.name.toLowerCase())
      || ids.has(card.id) || names.has(card.name.toLowerCase())
      || oracles.has(card.oracleId) || illustrations.has(card.illustrationId)
    ) continue;
    ids.add(card.id);
    names.add(card.name.toLowerCase());
    oracles.add(card.oracleId);
    illustrations.add(card.illustrationId);
    candidates.push(card);
  }
  if (candidates.length < 25) throw new Error(`Only found ${candidates.length} eligible cards for ${era.id}`);
  return { candidates: rankBalanced(candidates), query: base.href, pages, totalCards: first.total_cards };
};

const downloadCard = async (card, output) => {
  const response = await request(card.imageURL, 'image/jpeg');
  if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/jpeg')) {
    throw new Error(`Expected JPEG for ${card.id}`);
  }
  const bytes = await readBounded(response, MAXIMUM_IMAGE_BYTES, 'Scryfall card image');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error(`Invalid JPEG for ${card.id}`);
  }
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false });
  const file = `images/${card.id}.jpg`;
  await writeFile(join(output, file), bytes);
  return {
    ...card,
    file,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    width: decoded.width,
    height: decoded.height,
    sourceType: 'scryfall-normal-jpeg',
    rights: 'Wizards of the Coast card image; local research fixture, not redistributed',
  };
};

const run = async ({ output, developmentReport: developmentPath }) => {
  const developmentBytes = await readFile(developmentPath);
  const developmentReport = JSON.parse(developmentBytes.toString('utf8'));
  if (
    developmentReport.study !== 'crop-local-card-recall-mtg-development'
    || !Array.isArray(developmentReport.sourceProvenance)
  ) throw new Error('Development report is not valid exclusion evidence');
  const excluded = {
    ids: new Set(developmentReport.sourceProvenance.map(({ id }) => id.toLowerCase())),
    names: new Set(developmentReport.sourceProvenance.map(({ name }) => name.toLowerCase())),
    hashes: new Set(developmentReport.sourceProvenance.map(({ sha256: hash }) => hash)),
  };
  await mkdir(join(output, 'images'), { recursive: true });
  const images = [];
  const acquisitionEras = [];
  const globalNames = new Set();
  const globalOracles = new Set();
  const globalIllustrations = new Set();
  const globalHashes = new Set();
  for (let eraIndex = 0; eraIndex < MTG_CARD_HOLDOUT_ERAS.length; eraIndex += 1) {
    const era = MTG_CARD_HOLDOUT_ERAS[eraIndex];
    const result = await collectEraCandidates(era, eraIndex, excluded);
    let selected = 0;
    for (const card of result.candidates) {
      if (selected >= 25) break;
      if (
        globalNames.has(card.name.toLowerCase()) || globalOracles.has(card.oracleId)
        || globalIllustrations.has(card.illustrationId)
      ) continue;
      const image = await downloadCard(card, output);
      if (excluded.hashes.has(image.sha256) || globalHashes.has(image.sha256)) continue;
      images.push(image);
      globalNames.add(card.name.toLowerCase());
      globalOracles.add(card.oracleId);
      globalIllustrations.add(card.illustrationId);
      globalHashes.add(image.sha256);
      selected += 1;
    }
    if (selected !== 25) throw new Error(`Only downloaded ${selected}/25 unique cards for ${era.id}`);
    acquisitionEras.push({ era: era.id, query: result.query, pages: result.pages, totalCards: result.totalCards });
  }
  images.sort((left, right) => (
    MTG_CARD_HOLDOUT_ERAS.findIndex(({ id }) => id === left.era)
    - MTG_CARD_HOLDOUT_ERAS.findIndex(({ id }) => id === right.era)
    || left.id.localeCompare(right.id)
  ));
  const manifest = buildMtgCardHoldoutManifest({
    images,
    developmentReport,
    developmentReportSha256: sha256(developmentBytes),
    createdAt: new Date().toISOString(),
    acquisition: {
      source: 'Scryfall Cards API and normal JPEG image CDN',
      userAgent: USER_AGENT,
      requestDelayMilliseconds: REQUEST_DELAY_MS,
      apiGuidance: 'https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17',
      pagesPerEra: PAGES_PER_ERA,
      selectionAlgorithm: 'fixed-seed page sampling followed by deterministic weighted coverage ranking',
      eras: acquisitionEras,
    },
  });
  const manifestPath = join(output, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    output,
    manifest: manifestPath,
    sources: manifest.images.length,
    byEra: Object.fromEntries(MTG_CARD_HOLDOUT_ERAS.map(({ id }) => [
      id,
      manifest.images.filter(image => image.era === id).length,
    ])),
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly ? {
    ...MTG_CARD_RECALL_HOLDOUT_PROFILE,
    eras: MTG_CARD_HOLDOUT_ERAS,
    sourcePixels: 'local-only-outside-repository',
    selection: 'fixed-seed Scryfall page sampling and coverage ranking',
    rights: 'Wizards of the Coast card images are not redistributed',
  } : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`prepare MTG card holdout: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
