import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';

const PINNED_COMMIT = 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424';
const REQUIRED_TAGS = [
  'alpha',
  'checkerboard',
  'edge',
  'extreme-aspect-ratio',
  'fast-path-64x64',
  'flat-color',
  'gradient',
  'minimum-dimensions',
  'odd-dimensions',
  'rgb-equals-gray',
  'seeded-random',
] as const;

type PixelFormat = 'gray8' | 'rgb8' | 'rgba8';
type OraclePixelFormat = Exclude<PixelFormat, 'rgba8'>;

interface EncodedBytes {
  readonly encoding: 'base64';
  readonly data: string;
  readonly sha256: string;
}

interface CorpusVector {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly format: PixelFormat;
  readonly source: EncodedBytes;
  readonly oracleInput: EncodedBytes & {
    readonly format: OraclePixelFormat;
  };
  readonly expected: {
    readonly hash: string;
    readonly quality: number;
  };
  readonly equivalenceGroup?: string;
}

interface Corpus {
  readonly schemaVersion: 1;
  readonly algorithm: 'pdq-v1';
  readonly oracle: {
    readonly repository: 'https://github.com/facebook/ThreatExchange.git';
    readonly commit: string;
  };
  readonly vectors: readonly CorpusVector[];
}

const fixturePath = join(
  process.cwd(),
  '__tests__',
  'fixtures',
  'pdq',
  'raw-vectors.json',
);

const loadCorpus = (): Corpus => JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as Corpus;

const decode = (encoded: EncodedBytes): Buffer => Buffer.from(encoded.data, 'base64');

const sha256 = (bytes: Uint8Array): string => createHash('sha256')
  .update(bytes)
  .digest('hex');

const channelCount = (format: PixelFormat): number => {
  if (format === 'gray8') {
    return 1;
  }
  if (format === 'rgb8') {
    return 3;
  }
  return 4;
};

const compositeRgbaOverWhite = (source: Uint8Array): Uint8Array => {
  const output = new Uint8Array(source.length / 4 * 3);
  for (let sourceIndex = 0, outputIndex = 0;
    sourceIndex < source.length;
    sourceIndex += 4, outputIndex += 3) {
    const alpha = source[sourceIndex + 3];
    for (let channel = 0; channel < 3; channel += 1) {
      const value = source[sourceIndex + channel];
      output[outputIndex + channel] = Math.floor(
        (value * alpha + 255 * (255 - alpha) + 127) / 255,
      );
    }
  }
  return output;
};

describe('PDQ raw conformance corpus', () => {
  it('pins the normative oracle and required fixture classes', () => {
    const corpus = loadCorpus();

    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.algorithm).toBe('pdq-v1');
    expect(corpus.oracle).toEqual({
      repository: 'https://github.com/facebook/ThreatExchange.git',
      commit: PINNED_COMMIT,
    });

    const tags = new Set(corpus.vectors.flatMap((vector) => vector.tags));
    for (const requiredTag of REQUIRED_TAGS) {
      expect(tags, `Missing fixture class: ${requiredTag}`).toContain(requiredTag);
    }
  });

  it('contains valid self-checking raw bytes and canonical oracle answers', () => {
    const corpus = loadCorpus();
    const ids = new Set<string>();

    for (const vector of corpus.vectors) {
      expect(ids.has(vector.id), `Duplicate vector id: ${vector.id}`).toBe(false);
      ids.add(vector.id);

      expect(vector.width).toBeGreaterThanOrEqual(5);
      expect(vector.height).toBeGreaterThanOrEqual(5);
      expect(['gray8', 'rgb8', 'rgba8']).toContain(vector.format);
      expect(['gray8', 'rgb8']).toContain(vector.oracleInput.format);
      expect(vector.description.length).toBeGreaterThan(0);
      expect(vector.tags.length).toBeGreaterThan(0);
      expect(vector.source.encoding).toBe('base64');
      expect(vector.oracleInput.encoding).toBe('base64');

      const source = decode(vector.source);
      const oracleInput = decode(vector.oracleInput);
      expect(source.toString('base64')).toBe(vector.source.data);
      expect(oracleInput.toString('base64')).toBe(vector.oracleInput.data);
      expect(source).toHaveLength(
        vector.width * vector.height * channelCount(vector.format),
      );
      expect(sha256(source)).toBe(vector.source.sha256);
      expect(sha256(oracleInput)).toBe(vector.oracleInput.sha256);
      expect(oracleInput).toHaveLength(
        vector.width * vector.height * channelCount(vector.oracleInput.format),
      );

      expect(vector.expected.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(vector.expected.quality)).toBe(true);
      expect(vector.expected.quality).toBeGreaterThanOrEqual(0);
      expect(vector.expected.quality).toBeLessThanOrEqual(100);
    }
  });

  it('passes gray and RGB source bytes directly to the oracle', () => {
    const corpus = loadCorpus();
    const directVectors = corpus.vectors.filter((vector) => vector.format !== 'rgba8');

    for (const vector of directVectors) {
      expect(vector.oracleInput.format).toBe(vector.format);
      expect(Buffer.compare(
        decode(vector.oracleInput),
        decode(vector.source),
      )).toBe(0);
    }
  });

  it('stores the exact approved RGB input for every RGBA vector', () => {
    const corpus = loadCorpus();
    const rgbaVectors = corpus.vectors.filter((vector) => vector.format === 'rgba8');

    expect(rgbaVectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of rgbaVectors) {
      expect(vector.oracleInput.format).toBe('rgb8');
      expect(Buffer.compare(
        decode(vector.oracleInput),
        Buffer.from(compositeRgbaOverWhite(decode(vector.source))),
      )).toBe(0);
    }
  });

  it('proves gray and equal-channel RGB inputs share oracle answers', () => {
    const corpus = loadCorpus();
    const equivalenceGroups = Map.groupBy(
      corpus.vectors.filter((vector) => vector.equivalenceGroup !== undefined),
      (vector) => vector.equivalenceGroup,
    );

    expect(equivalenceGroups.size).toBeGreaterThanOrEqual(1);
    for (const vectors of equivalenceGroups.values()) {
      expect(new Set(vectors.map((vector) => vector.format))).toEqual(
        new Set(['gray8', 'rgb8']),
      );
      expect(new Set(vectors.map((vector) => vector.expected.hash)).size).toBe(1);
      expect(new Set(vectors.map((vector) => vector.expected.quality)).size).toBe(1);
    }
  });
});
