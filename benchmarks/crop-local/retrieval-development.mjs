import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const FINGERPRINT_PROFILE = {
  maximumDimension: 768,
  maximumFeatures: 128,
  maximumFeaturesPerCell: 12,
  fastThreshold: 20,
  verificationMaximumDimension: 96,
};
const CUTOFFS = [1, 5, 10, 20, 200];
const PROFILES = [
  { name: 'raw-votes-8', substringBits: 8, deduplicateWithinImage: false, idf: false, maximumDocumentFrequency: 1 },
  { name: 'burst-suppressed-8', substringBits: 8, deduplicateWithinImage: true, idf: false, maximumDocumentFrequency: 1 },
  { name: 'idf-8', substringBits: 8, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 1 },
  { name: 'idf-stop50-8', substringBits: 8, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 0.5 },
  { name: 'idf-stop20-8', substringBits: 8, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 0.2 },
  { name: 'idf-stop10-8', substringBits: 8, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 0.1 },
  { name: 'idf-16', substringBits: 16, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 1 },
  { name: 'idf-stop20-16', substringBits: 16, deduplicateWithinImage: true, idf: true, maximumDocumentFrequency: 0.2 },
];

const parseArguments = (arguments_) => {
  let manifest;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--manifest') manifest = resolve(arguments_[index += 1]);
    else if (arguments_[index] === '--output') output = resolve(arguments_[index += 1]);
    else throw new Error('Usage: retrieval-development.mjs --manifest FILE --output FILE');
  }
  if (manifest === undefined || output === undefined) {
    throw new Error('Usage: retrieval-development.mjs --manifest FILE --output FILE');
  }
  return { manifest, output };
};

const crop = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

const transform = (source, mode) => {
  if (mode === 'center') {
    const width = Math.max(40, Math.floor(source.width * 0.7));
    const height = Math.max(40, Math.floor(source.height * 0.7));
    return crop(source, Math.floor((source.width - width) / 2), Math.floor((source.height - height) / 2), width, height);
  }
  if (mode === 'asymmetric') {
    const width = Math.max(40, Math.floor(source.width * 0.62));
    const height = Math.max(40, Math.floor(source.height * 0.82));
    return crop(source, 0, Math.floor((source.height - height) / 3), width, height);
  }
  const width = Math.max(40, Math.floor(source.width * 0.5));
  const height = Math.max(40, Math.floor(source.height * 0.65));
  return crop(source, source.width - width, Math.floor((source.height - height) / 4), width, height);
};

const descriptorTokens = (fingerprint, substringBits, deduplicate) => {
  const hexadecimalDigits = substringBits / 4;
  const output = [];
  fingerprint.features.forEach(({ descriptor }) => {
    for (let offset = 0; offset < descriptor.length; offset += hexadecimalDigits) {
      output.push(`${offset / hexadecimalDigits}:${descriptor.slice(offset, offset + hexadecimalDigits)}`);
    }
  });
  return deduplicate ? [...new Set(output)] : output;
};

const recallAt = (ranks, cutoff) => (
  ranks.length === 0 ? null : ranks.filter((rank) => rank <= cutoff).length / ranks.length
);

const evaluate = (profile, references, queries) => {
  const postings = new Map();
  references.forEach(({ id, fingerprint }) => {
    descriptorTokens(fingerprint, profile.substringBits, profile.deduplicateWithinImage)
      .forEach((token) => {
        const posting = postings.get(token) ?? new Map();
        posting.set(id, (posting.get(id) ?? 0) + 1);
        postings.set(token, posting);
      });
  });
  const ranks = queries.map((query) => {
    const scores = new Map();
    descriptorTokens(query.fingerprint, profile.substringBits, profile.deduplicateWithinImage)
      .forEach((token) => {
        const posting = postings.get(token);
        if (posting === undefined || posting.size / references.length > profile.maximumDocumentFrequency) return;
        const weight = profile.idf ? Math.log((references.length + 1) / (posting.size + 1)) + 1 : 1;
        posting.forEach((count, id) => scores.set(id, (scores.get(id) ?? 0) + weight * count));
      });
    const ranked = [...scores].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const index = ranked.findIndex(([id]) => id === query.sourceId);
    return {
      sourceId: query.sourceId,
      domain: query.domain,
      transformation: query.transformation,
      verifierAccepted: query.verifierAccepted,
      rank: index < 0 ? null : index + 1,
      candidatesWithEvidence: ranked.length,
      trueSourceScore: index < 0 ? 0 : ranked[index][1],
    };
  });
  const accepted = ranks.filter(({ verifierAccepted }) => verifierAccepted);
  const summarize = (entries) => ({
    queries: entries.length,
    missed: entries.filter(({ rank }) => rank === null).length,
    recall: Object.fromEntries(CUTOFFS.map((cutoff) => [cutoff, recallAt(
      entries.map(({ rank }) => rank ?? Number.POSITIVE_INFINITY), cutoff,
    )])),
  });
  return {
    ...profile,
    allPositiveQueries: summarize(ranks),
    verifierAcceptedQueries: summarize(accepted),
    passRecallAt200: accepted.length > 0 && recallAt(
      accepted.map(({ rank }) => rank ?? Number.POSITIVE_INFINITY), 200,
    ) >= 0.98,
    ranks,
  };
};

const run = async ({ manifest: manifestPath, output }) => {
  const require = createRequire(import.meta.url);
  const { decodeImage } = require('../../lib/node.js');
  const { compareCropLocalFingerprints, fingerprintCropLocalExperiment } = require('../../lib/core/algorithms/crop-local/index.js');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const root = dirname(manifestPath);
  const references = [];
  const queries = [];
  for (const entry of manifest.images) {
    const encoded = await readFile(join(root, entry.file));
    if (createHash('sha256').update(encoded).digest('hex') !== entry.sha256) {
      throw new Error(`SHA-256 mismatch for ${entry.id}`);
    }
    const pixels = await decodeImage(encoded);
    const original = fingerprintCropLocalExperiment(pixels, FINGERPRINT_PROFILE);
    references.push({ id: entry.id, domain: entry.domain, fingerprint: original });
    for (const mode of ['center', 'asymmetric', 'severe']) {
      const fingerprint = fingerprintCropLocalExperiment(transform(pixels, mode), FINGERPRINT_PROFILE);
      const evidence = compareCropLocalFingerprints(original, fingerprint);
      queries.push({
        sourceId: entry.id,
        domain: entry.domain,
        transformation: mode,
        verifierAccepted: evidence.status === 'match',
        fingerprint,
      });
    }
  }
  const profiles = PROFILES.map((profile) => evaluate(profile, references, queries));
  const selected = [...profiles].sort((left, right) => (
    Number(right.passRecallAt200) - Number(left.passRecallAt200)
    || (right.verifierAcceptedQueries.recall[10] ?? -1) - (left.verifierAcceptedQueries.recall[10] ?? -1)
    || (right.verifierAcceptedQueries.recall[1] ?? -1) - (left.verifierAcceptedQueries.recall[1] ?? -1)
  ))[0];
  const compact = ({ ranks: _ranks, ...profile }) => profile;
  const report = {
    profileVersion: 1,
    study: 'crop-local-v0-indexed-retrieval-development',
    corpus: manifest.corpus,
    sourceManifest: manifestPath,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sourceProvenance: manifest.images.map(({ file: _file, ...entry }) => entry),
    counts: {
      references: references.length,
      positiveQueries: queries.length,
      verifierAcceptedQueries: queries.filter(({ verifierAccepted }) => verifierAccepted).length,
    },
    gate: { metric: 'candidate recall@200 for verifier-accepted queries', minimum: 0.98 },
    selectedProfile: compact(selected),
    profiles: profiles.map(compact),
    limitations: [
      'This 50-reference pilot cannot establish million-scale retrieval behavior.',
      'Profile selection and measurement use development data.',
      'The index representation is experimental and is not exported by the package.',
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return {
    output,
    counts: report.counts,
    selectedProfile: {
      name: selected.name,
      passRecallAt200: selected.passRecallAt200,
      allPositiveQueries: selected.allPositiveQueries,
      verifierAcceptedQueries: selected.verifierAcceptedQueries,
    },
  };
};

try {
  process.stdout.write(`${JSON.stringify(await run(parseArguments(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`crop-local retrieval development: ${error.stack ?? error.message}\n`);
  process.exitCode = 2;
}
