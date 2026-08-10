import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const QUERIES = [
  'landscape', 'portrait', 'animal', 'flower', 'ship', 'city',
  'sculpture', 'textile', 'photograph', 'still life',
];

const parseArguments = (arguments_) => {
  if (arguments_.length === 1 && arguments_[0] === '--plan-only') {
    return { planOnly: true, count: 20 };
  }
  let output;
  let count = 20;
  for (let index = 0; index < arguments_.length; index += 2) {
    if (arguments_[index] === '--output') output = resolve(arguments_[index + 1]);
    else if (arguments_[index] === '--count') count = Number(arguments_[index + 1]);
    else throw new Error('Usage: prepare-met-corpus.mjs --output DIR [--count N]');
  }
  if (output === undefined || !Number.isSafeInteger(count) || count < 10 || count > 100) {
    throw new Error('Usage: prepare-met-corpus.mjs --output DIR [--count N from 10 through 100]');
  }
  return { planOnly: false, output, count };
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
};

const run = async ({ output, count }) => {
  await mkdir(join(output, 'images'), { recursive: true });
  const selected = [];
  const seen = new Set();
  for (const query of QUERIES) {
    if (selected.length >= count) break;
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
    const search = await fetchJson(searchUrl);
    const candidateIds = (search.objectIDs ?? []).slice(0, 30);
    for (const objectID of candidateIds) {
      if (selected.length >= count || seen.has(objectID)) continue;
      seen.add(objectID);
      const apiUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectID}`;
      const object = await fetchJson(apiUrl);
      if (object.isPublicDomain !== true || !object.primaryImageSmall) continue;
      const response = await fetch(object.primaryImageSmall);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) continue;
      const file = `images/${objectID}.jpg`;
      await writeFile(join(output, file), bytes);
      selected.push({
        objectID,
        query,
        title: object.title,
        artistDisplayName: object.artistDisplayName,
        objectDate: object.objectDate,
        objectURL: object.objectURL,
        apiURL: apiUrl,
        imageURL: object.primaryImageSmall,
        file,
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        isPublicDomain: true,
        license: 'CC0-1.0',
      });
    }
  }
  if (selected.length < count) throw new Error(`Only found ${selected.length} eligible images`);
  const manifest = {
    schemaVersion: 1,
    corpus: 'met-open-access-crop-block-v1',
    createdAt: new Date().toISOString(),
    source: {
      name: 'The Metropolitan Museum of Art Collection API',
      apiDocumentation: 'https://metmuseum.github.io/',
      openAccessPolicy: 'https://www.metmuseum.org/hubs/open-access',
      license: 'CC0-1.0',
    },
    redistribution: 'Images remain local-only despite CC0 eligibility; retained results contain metadata and hashes only.',
    images: selected,
  };
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { output, images: selected.length, manifest: join(output, 'manifest.json') };
};

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.planOnly
    ? { corpus: 'met-open-access-crop-block-v1', queries: QUERIES, count: options.count, localOnly: true }
    : await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`prepare Met crop-block corpus: ${error.message}\n`);
  process.exitCode = 2;
}
