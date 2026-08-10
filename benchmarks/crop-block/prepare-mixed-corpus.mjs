import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const COMMONS_DOMAINS = [
  { domain: 'photograph', search: 'landscape photograph public domain' },
  { domain: 'portrait', search: 'historical portrait photograph public domain' },
  { domain: 'document', search: 'scanned document public domain' },
];
const SYNTHETIC_DOMAINS = ['screenshot', 'card-layout'];
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'image-fingerprint-crop-block-research/0.1 (https://github.com/dills122/image-hash)';

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') {
    return {
      planOnly: true,
      perDomain: 10,
      commonsStartOffset: 0,
      syntheticSeedOffset: 0,
      syntheticStyle: 1,
      corpus: 'mixed-domain-crop-block-confirmation-v1',
    };
  }
  let output;
  let perDomain = 10;
  let commonsStartOffset = 0;
  let syntheticSeedOffset = 0;
  let syntheticStyle = 1;
  let excludeManifest;
  let corpus = 'mixed-domain-crop-block-confirmation-v1';
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--per-domain') perDomain = Number(arguments_[index + 1]);
    else if (arguments_[index] === '--commons-start-offset') commonsStartOffset = Number(arguments_[index + 1]);
    else if (arguments_[index] === '--synthetic-seed-offset') syntheticSeedOffset = Number(arguments_[index + 1]);
    else if (arguments_[index] === '--synthetic-style') syntheticStyle = Number(arguments_[index + 1]);
    else if (arguments_[index] === '--exclude-manifest') excludeManifest = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--corpus') corpus = arguments_[index + 1];
    else throw new Error('Usage: prepare-mixed-corpus.mjs --output DIR [--per-domain N] [--commons-start-offset N] [--synthetic-seed-offset N] [--synthetic-style 1|2] [--exclude-manifest FILE] [--corpus NAME]');
  }
  if (
    output === undefined
    || !Number.isSafeInteger(perDomain) || perDomain < 5 || perDomain > 25
    || !Number.isSafeInteger(commonsStartOffset) || commonsStartOffset < 0
    || !Number.isSafeInteger(syntheticSeedOffset) || syntheticSeedOffset < 0
    || ![1, 2].includes(syntheticStyle)
    || !/^[a-z0-9][a-z0-9-]{2,80}$/.test(corpus)
  ) {
    throw new Error('Invalid mixed-corpus preparation arguments');
  }
  return {
    planOnly: false,
    output,
    perDomain,
    commonsStartOffset,
    syntheticSeedOffset,
    syntheticStyle,
    excludeManifest,
    corpus,
  };
};

const delay = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

const fetchChecked = async (url) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await delay(350);
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
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
  if (offset !== undefined) query.set('gsroffset', String(offset));
  return `${API}?${query}`;
};

const downloadCommonsDomain = async ({ domain, search }, output, count, seen, startOffset) => {
  const selected = [];
  let offset = startOffset === 0 ? undefined : startOffset;
  for (let page = 0; page < 8 && selected.length < count; page += 1) {
    const apiUrl = commonsSearchUrl(search, offset);
    const payload = await (await fetchChecked(apiUrl)).json();
    for (const item of payload.query?.pages ?? []) {
      if (selected.length >= count || seen.has(item.pageid)) continue;
      const information = item.imageinfo?.[0];
      if (
        information === undefined
        || !acceptedLicense(information.extmetadata)
        || !['image/jpeg', 'image/png'].includes(information.mime)
        || information.thumburl === undefined
        || information.thumbwidth < 64
        || information.thumbheight < 64
      ) continue;
      const response = await fetchChecked(information.thumburl);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) continue;
      const extension = information.mime === 'image/png' ? 'png' : 'jpg';
      const file = `images/${domain}-commons-${item.pageid}.${extension}`;
      await writeFile(join(output, file), bytes);
      seen.add(item.pageid);
      selected.push({
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
        sha256: createHash('sha256').update(bytes).digest('hex'),
        license: field(information.extmetadata, 'LicenseShortName'),
        licenseURL: field(information.extmetadata, 'LicenseUrl') || null,
        attributionRequired: field(information.extmetadata, 'AttributionRequired') === 'true',
      });
    }
    offset = payload.continue?.gsroffset;
    if (offset === undefined) break;
  }
  if (selected.length < count) {
    throw new Error(`Only found ${selected.length}/${count} eligible ${domain} Commons images`);
  }
  return selected;
};

const paintRectangle = (data, width, x, y, rectangleWidth, rectangleHeight, color) => {
  for (let row = Math.max(0, y); row < Math.min(data.height, y + rectangleHeight); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(width, x + rectangleWidth); column += 1) {
      const index = (row * width + column) * 4;
      data.data[index] = color[0];
      data.data[index + 1] = color[1];
      data.data[index + 2] = color[2];
      data.data[index + 3] = 255;
    }
  }
};

const createSynthetic = (domain, seed, style) => {
  const width = domain === 'screenshot' ? (style === 1 ? 960 : 1024) : (style === 1 ? 700 : 760);
  const height = domain === 'screenshot' ? (style === 1 ? 640 : 700) : (style === 1 ? 980 : 1040);
  const image = new PNG({ width, height, colorType: 6 });
  let state = (seed + 1) * 0x9e3779b1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  paintRectangle(image, width, 0, 0, width, height, domain === 'screenshot' ? [239, 243, 248] : [32, 38, 48]);
  if (domain === 'screenshot') {
    const headerHeight = style === 1 ? 58 : 64;
    const sidebarWidth = style === 1 ? 190 : 220;
    paintRectangle(image, width, 0, 0, width, headerHeight, [30 + seed * 4, 45, 70]);
    paintRectangle(image, width, 0, headerHeight, sidebarWidth, height - headerHeight, [53, 66 + seed * 3, 88]);
    for (let row = 0; row < (style === 1 ? 6 : 7); row += 1) {
      paintRectangle(image, width, 28, 95 + row * (style === 1 ? 62 : 70), 118 + random() % 55, 13, [160, 177, 198]);
    }
    const columns = style === 1 ? 3 : 4;
    const cardCount = style === 1 ? 6 : 8;
    const cardWidth = style === 1 ? 205 : 175;
    const cardHeight = style === 1 ? 210 : 240;
    for (let card = 0; card < cardCount; card += 1) {
      const x = sidebarWidth + 35 + (card % columns) * (cardWidth + 25);
      const y = 92 + Math.floor(card / columns) * (cardHeight + 30);
      paintRectangle(image, width, x, y, cardWidth, cardHeight, [255, 255, 255]);
      paintRectangle(image, width, x + 18, y + 20, cardWidth - 36, 72, [60 + random() % 150, 80 + random() % 130, 100 + random() % 120]);
      for (let line = 0; line < 5; line += 1) {
        paintRectangle(image, width, x + 18, y + 112 + line * 18, 70 + random() % Math.max(40, cardWidth - 80), 7, [112, 126, 145]);
      }
    }
  } else {
    const inset = style === 1 ? 28 : 36;
    const contentX = style === 1 ? 78 : 92;
    paintRectangle(image, width, inset, inset, width - inset * 2, height - inset * 2, [232 + seed % 12, 224, 200 - seed % 20]);
    paintRectangle(image, width, contentX - 24, style === 1 ? 58 : 72, width - (contentX - 24) * 2, style === 1 ? 108 : 136, [65 + random() % 100, 55 + random() % 100, 75 + random() % 100]);
    paintRectangle(image, width, contentX, style === 1 ? 190 : 236, width - contentX * 2, style === 1 ? 330 : 370, [45 + random() % 180, 55 + random() % 160, 65 + random() % 160]);
    for (let line = 0; line < (style === 1 ? 13 : 12); line += 1) {
      paintRectangle(image, width, contentX, (style === 1 ? 558 : 646) + line * 24, 300 + random() % 260, 10, [55, 52, 48]);
    }
    for (let symbol = 0; symbol < 5; symbol += 1) {
      paintRectangle(image, width, 520 + symbol * 27, 875, 18, 18, [80 + random() % 150, 70, 70]);
    }
  }
  return PNG.sync.write(image, { colorType: 6 });
};

const generateSyntheticDomain = async (domain, output, count, seedOffset, style) => {
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const seed = seedOffset + index;
    const bytes = createSynthetic(domain, seed, style);
    const file = `images/${domain}-generated-style${style}-${seed}.png`;
    await writeFile(join(output, file), bytes);
    selected.push({
      id: `${domain}-generated-style${style}-${seed}`,
      domain,
      sourceType: 'deterministic-generated',
      title: `${domain} deterministic fixture ${seed}`,
      file,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      license: 'CC0-1.0',
      licenseURL: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      generator: 'benchmarks/crop-block/prepare-mixed-corpus.mjs',
      seed,
      style,
    });
  }
  return selected;
};

const run = async ({
  output,
  perDomain,
  commonsStartOffset,
  syntheticSeedOffset,
  syntheticStyle,
  excludeManifest,
  corpus,
}) => {
  await mkdir(join(output, 'images'), { recursive: true });
  const images = [];
  const excluded = excludeManifest === undefined
    ? null : JSON.parse(await readFile(excludeManifest, 'utf8'));
  const seen = new Set((excluded?.images ?? []).flatMap((image) => (
    Number.isSafeInteger(image.pageId) ? [image.pageId] : []
  )));
  for (const definition of COMMONS_DOMAINS) {
    images.push(...await downloadCommonsDomain(
      definition, output, perDomain, seen, commonsStartOffset,
    ));
  }
  for (const domain of SYNTHETIC_DOMAINS) {
    images.push(...await generateSyntheticDomain(
      domain, output, perDomain, syntheticSeedOffset, syntheticStyle,
    ));
  }
  const manifest = {
    schemaVersion: 1,
    corpus,
    createdAt: new Date().toISOString(),
    selection: {
      perDomain,
      domains: [...COMMONS_DOMAINS.map(({ domain }) => domain), ...SYNTHETIC_DOMAINS],
      commonsLicenseAllowlist: ['Public domain', 'CC0'],
      commonsRestrictionsRequiredEmpty: true,
      commonsStartOffset,
      excludedManifest: excludeManifest ?? null,
      syntheticSeedOffset,
      syntheticStyle,
    },
    sources: {
      commons: {
        api: API,
        reuseGuidance: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
      },
      synthetic: { license: 'CC0-1.0' },
    },
    redistribution: 'Source pixels remain local-only; retained reports contain metadata and hashes only.',
    images,
  };
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    output,
    manifest: join(output, 'manifest.json'),
    images: images.length,
    domains: Object.fromEntries(manifest.selection.domains.map((domain) => [
      domain, images.filter((image) => image.domain === domain).length,
    ])),
  };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly
    ? {
      corpus: 'mixed-domain-crop-block-confirmation-v1',
      commonsDomains: COMMONS_DOMAINS,
      syntheticDomains: SYNTHETIC_DOMAINS,
      perDomain: options.perDomain,
      localOnly: true,
    }
    : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`prepare mixed crop-block corpus: ${error.message}\n`);
  process.exitCode = 2;
}
