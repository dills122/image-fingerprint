import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  buildCropLocalItemColorRetrievalIndex,
  loadCropLocalItemColorRetrievalIndex,
  queryCropLocalItemColorRetrievalIndex,
  serializeCropLocalItemColorRetrievalIndex,
} from '../benchmarks/crop-local/item-color-retrieval-index.mjs';

const fingerprint = (...descriptors: string[]) => ({
  experimental: true,
  experimentalProfile: 'crop-local-item-color-v0',
  local: {
    features: descriptors.map(descriptor => ({ descriptor })),
  },
});

const references = () => [
  { id: 'echo', fingerprint: fingerprint('e'.repeat(64), 'f'.repeat(64)) },
  { id: 'alpha', fingerprint: fingerprint('a'.repeat(64), 'f'.repeat(64)) },
  { id: 'delta', fingerprint: fingerprint('d'.repeat(64), 'f'.repeat(64)) },
  { id: 'bravo', fingerprint: fingerprint('b'.repeat(64), 'f'.repeat(64)) },
  { id: 'charlie', fingerprint: fingerprint('c'.repeat(64), 'f'.repeat(64)) },
];

describe('crop-local item-color retrieval index', () => {
  it('predeclares the generated mechanical scaling study', () => {
    const result = spawnSync(
      process.execPath,
      ['benchmarks/crop-local/retrieval-scaling.mjs', '--plan-only'],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      profileVersion: 1,
      study: 'crop-local-item-color-retrieval-mechanical-scaling-v1',
      referenceCounts: [500, 1_000, 2_000],
      queriesPerScale: 40,
      featuresPerReference: 96,
      queryFeatures: 72,
      broadFeaturesPerReference: 32,
      broadTokenValuesPerPosition: 512,
      descriptorTokenBits: 16,
      candidateLimit: 50,
      corpus: 'deterministic-generated-descriptor-mechanics-only',
      assertions: [
        'loaded-ranking-exact',
        'true-source-recall-at-1',
        'candidate-limit-bounded',
      ],
      optimizationAcceptance: [
        'candidate-ranking-sha256-unchanged-at-every-scale',
        'index-statistics-unchanged-at-every-scale',
        '2000-reference-query-p50-lower-than-full-sort-baseline',
      ],
    });
  });

  it('builds a deterministic serialized index and drops high-frequency tokens', () => {
    const forward = buildCropLocalItemColorRetrievalIndex(references());
    const reverse = buildCropLocalItemColorRetrievalIndex(references().reverse());

    expect(serializeCropLocalItemColorRetrievalIndex(forward)).toBe(
      serializeCropLocalItemColorRetrievalIndex(reverse),
    );
    expect(forward.document.referenceIds).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    expect(forward.document.statistics).toEqual({
      indexedTokens: 80,
      postingEntries: 80,
      droppedHighFrequencyTokens: 16,
    });
  });

  it('round-trips the index and ranks matching descriptor evidence with stable ties', () => {
    const built = buildCropLocalItemColorRetrievalIndex(references());
    const loaded = loadCropLocalItemColorRetrievalIndex(
      Buffer.from(serializeCropLocalItemColorRetrievalIndex(built)),
    );
    const exact = queryCropLocalItemColorRetrievalIndex(
      loaded,
      fingerprint('a'.repeat(64), 'f'.repeat(64)),
      2,
    );
    expect(exact).toMatchObject({
      candidates: [{ id: 'alpha', matchedTokens: 16 }],
      candidatesWithEvidence: 1,
      queryTokens: 32,
      indexedQueryTokens: 16,
      postingEntriesVisited: 16,
    });

    const tied = queryCropLocalItemColorRetrievalIndex(
      loaded,
      fingerprint('b'.repeat(64), 'a'.repeat(64)),
      1,
    );
    expect(tied.candidates.map(({ id }) => id)).toEqual(['alpha']);
    expect(tied.candidatesWithEvidence).toBe(2);
  });

  it('rejects duplicate references, malformed descriptors, invalid limits, and corrupt indexes', () => {
    expect(() => buildCropLocalItemColorRetrievalIndex([
      references()[0],
      references()[0],
    ])).toThrow('unique non-empty strings');
    expect(() => buildCropLocalItemColorRetrievalIndex([{
      id: 'invalid',
      fingerprint: fingerprint('not-a-descriptor'),
    }])).toThrow('256-bit lowercase hex');

    const index = buildCropLocalItemColorRetrievalIndex(references());
    expect(() => queryCropLocalItemColorRetrievalIndex(index, fingerprint('a'.repeat(64)), 0)).toThrow(
      'candidate limit',
    );
    expect(() => queryCropLocalItemColorRetrievalIndex(
      { document: index.document, postings: index.postings },
      fingerprint('a'.repeat(64)),
      1,
    )).toThrow('must be hydrated');
    const document = JSON.parse(serializeCropLocalItemColorRetrievalIndex(index));
    document.postings[0][1] = [99];
    expect(() => loadCropLocalItemColorRetrievalIndex(JSON.stringify(document))).toThrow(
      'posting ordinals',
    );
  });
});
